/**
 * CMYK変換時の色変化リスクが高い色を検出し、警告表示するスクリプト
 * リスクカラーのピクセルは赤で置き換えて表示
 */

// リスクカラーのリスト（CSVから読み込まれる）
let RISKY_COLORS = [];

// CSVファイルを読み込んでRISKY_COLORSを初期化
async function loadRiskyColors() {
    try {
        const response = await fetch('risky_colors.csv');
        const csvText = await response.text();
        const lines = csvText.split('\n');
        
        // ヘッダー行をスキップ
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '') continue;
            
            const parts = line.split(',');
            if (parts.length >= 3) {
                const r = parseInt(parts[0], 10);
                const g = parseInt(parts[1], 10);
                const b = parseInt(parts[2], 10);
                
                if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                    // 詳細情報も保持（オプション）
                    const colorData = { r, g, b };
                    
                    // 詳細情報が存在する場合は追加
                    if (parts.length >= 4) colorData.hex = parts[3];
                    if (parts.length >= 5) colorData.hue = parseFloat(parts[4]);
                    if (parts.length >= 6) colorData.c = parseFloat(parts[5]);
                    if (parts.length >= 7) colorData.m = parseFloat(parts[6]);
                    if (parts.length >= 8) colorData.y = parseFloat(parts[7]);
                    if (parts.length >= 9) colorData.k = parseFloat(parts[8]);
                    if (parts.length >= 10) colorData.deltaE2000 = parseFloat(parts[9]);
                    if (parts.length >= 11) colorData.tag = parts[10];
                    if (parts.length >= 12) colorData.description = parts[11];
                    
                    RISKY_COLORS.push(colorData);
                }
            }
        }
        
        console.log(`リスクカラーを ${RISKY_COLORS.length} 件読み込みました。`);
    } catch (error) {
        console.error('リスクカラーCSVの読み込みエラー:', error);
        // エラー時はデフォルトのリスクカラーを使用
        RISKY_COLORS = [
            { r: 0, g: 255, b: 0 },
            { r: 255, g: 0, b: 255 },
            { r: 0, g: 0, b: 255 },
            { r: 0, g: 255, b: 255 },
        ];
    }
}

// ファイルを保存ダイアログで保存する関数
async function saveFileWithDialog(blob, defaultFileName) {
    try {
        // File System Access APIが利用可能かチェック
        if ('showSaveFilePicker' in window) {
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: defaultFileName,
                types: [{
                    description: 'PNG画像',
                    accept: {
                        'image/png': ['.png']
                    }
                }]
            });
            
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            return true;
        } else {
            // フォールバック: 従来のダウンロード方法
            const link = document.createElement('a');
            link.download = defaultFileName;
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
            return false;
        }
    } catch (error) {
        // ユーザーがキャンセルした場合など
        if (error.name !== 'AbortError') {
            console.error('ファイル保存エラー:', error);
            // エラー時はフォールバック
            const link = document.createElement('a');
            link.download = defaultFileName;
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
        }
        return false;
    }
}

// 色の距離を計算（RGB空間でのユークリッド距離）
function colorDistance(rgb1, rgb2) {
    const dr = rgb1.r - rgb2.r;
    const dg = rgb1.g - rgb2.g;
    const db = rgb1.b - rgb2.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

// RGBをHSVに変換
function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    
    let h = 0;
    if (diff !== 0) {
        if (max === r) {
            h = ((g - b) / diff) % 6;
        } else if (max === g) {
            h = (b - r) / diff + 2;
        } else {
            h = (r - g) / diff + 4;
        }
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    
    const s = max === 0 ? 0 : diff / max;
    const v = max;
    
    return { h, s, v };
}

// HSVをRGBに変換
function hsvToRgb(h, s, v) {
    h = h % 360;
    if (h < 0) h += 360;
    
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    
    let r, g, b;
    
    if (h >= 0 && h < 60) {
        r = c; g = x; b = 0;
    } else if (h >= 60 && h < 120) {
        r = x; g = c; b = 0;
    } else if (h >= 120 && h < 180) {
        r = 0; g = c; b = x;
    } else if (h >= 180 && h < 240) {
        r = 0; g = x; b = c;
    } else if (h >= 240 && h < 300) {
        r = x; g = 0; b = c;
    } else {
        r = c; g = 0; b = x;
    }
    
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    };
}

// リスクカラーをリスクの少ないカラーに変換（元の色に近い状態を保ちつつ、少しだけリスクを減らす）
function convertToSaferColor(r, g, b) {
    // RGB空間で直接調整して、元の色に近い状態を保ちつつリスクを減らす
    // 各RGB成分を少しだけグレー寄りにする（10-15%程度）
    const gray = (r + g + b) / 3;
    const blendRatio = 0.12; // 12%だけグレーとブレンド（元の色を88%保持）
    
    const newR = Math.round(r * (1 - blendRatio) + gray * blendRatio);
    const newG = Math.round(g * (1 - blendRatio) + gray * blendRatio);
    const newB = Math.round(b * (1 - blendRatio) + gray * blendRatio);
    
    return { r: newR, g: newG, b: newB };
}

// リスクカラーかどうかを判定
function isRiskyColor(r, g, b, threshold = 30) {
    // 方法1: 既知のリスクカラーとの距離をチェック
    const pixelColor = { r, g, b };
    for (const riskyColor of RISKY_COLORS) {
        if (colorDistance(pixelColor, riskyColor) <= threshold) {
            return true;
        }
    }
    
    // 方法2: HSV色空間でリスクの高い色相範囲をチェック
    const hsv = rgbToHsv(r, g, b);
    const s = hsv.s; // 彩度
    const h = hsv.h; // 色相
    
    // 彩度が高い（0.7以上）場合に、リスクの高い色相範囲をチェック
    if (s >= 0.7) {
        // 緑系: 100-170度
        if (h >= 100 && h <= 170) return true;
        // シアン系: 170-200度
        if (h >= 170 && h <= 200) return true;
        // 青系: 220-260度
        if (h >= 220 && h <= 260) return true;
        // マゼンタ系: 280-320度
        if (h >= 280 && h <= 320) return true;
    }
    
    return false;
}

// 画像を解析してリスクカラーを検出し、赤で置き換える
function detectAndMarkRiskyColors(imageElement) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = imageElement.naturalWidth || imageElement.width;
        canvas.height = imageElement.naturalHeight || imageElement.height;
        
        // 元の画像を描画
        ctx.drawImage(imageElement, 0, 0);
        
        // ピクセルデータを取得
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        let riskyPixelCount = 0;
        const totalPixels = canvas.width * canvas.height;
        
        // 各ピクセルをチェック
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // リスクカラーかどうかを判定
            if (isRiskyColor(r, g, b)) {
                // リスクカラーのピクセルを赤に置き換え
                data[i] = 255;       // R
                data[i + 1] = 0;     // G
                data[i + 2] = 0;     // B
                // data[i + 3] は alpha なのでそのまま
                riskyPixelCount++;
            }
        }
        
        // 変更した画像データを描画
        ctx.putImageData(imageData, 0, 0);
        
        // 結果を返す
        const result = {
            canvas: canvas,
            riskyPixelCount: riskyPixelCount,
            totalPixels: totalPixels,
            riskyPercentage: ((riskyPixelCount / totalPixels) * 100).toFixed(2)
        };
        
        resolve(result);
    });
}

// リスクカラーをリスクの少ないカラーに変換した画像を生成
function convertRiskyColorsToSafer(imageElement) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = imageElement.naturalWidth || imageElement.width;
        canvas.height = imageElement.naturalHeight || imageElement.height;
        
        // 元の画像を描画
        ctx.drawImage(imageElement, 0, 0);
        
        // ピクセルデータを取得
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // 各ピクセルをチェック
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // リスクカラーかどうかを判定
            if (isRiskyColor(r, g, b)) {
                // リスクカラーをリスクの少ないカラーに変換
                const saferColor = convertToSaferColor(r, g, b);
                data[i] = saferColor.r;       // R
                data[i + 1] = saferColor.g;   // G
                data[i + 2] = saferColor.b;   // B
                // data[i + 3] は alpha なのでそのまま
            }
        }
        
        // 変更した画像データを描画
        ctx.putImageData(imageData, 0, 0);
        
        resolve(canvas);
    });
}

// 画像が読み込まれたときにリスクカラーを検出
function analyzeImageForRiskyColors() {
    const previewImage = document.getElementById('previewImage');
    
    if (!previewImage || !previewImage.classList.contains('show')) {
        return;
    }
    
    // 画像が完全に読み込まれるまで待つ
    if (!previewImage.complete) {
        previewImage.addEventListener('load', function onLoad() {
            previewImage.removeEventListener('load', onLoad);
            performRiskAnalysis(previewImage);
        });
    } else {
        performRiskAnalysis(previewImage);
    }
}

// リスク分析を実行
function performRiskAnalysis(imageElement) {
    const dropZone = document.getElementById('dropZone');
    const dropMessage = document.querySelector('.drop-message');
    
    // 既存の警告メッセージを削除
    const existingWarning = dropZone.querySelector('.risk-warning');
    if (existingWarning) {
        existingWarning.remove();
    }
    
    // 既存のリスク表示画像を削除
    const existingRiskImage = dropZone.querySelector('#riskImage');
    if (existingRiskImage) {
        existingRiskImage.remove();
    }
    
    // 既存の変換関連要素をすべて削除（クラス名で一括削除）
    const existingSaferElements = dropZone.querySelectorAll('.safer-conversion-element');
    existingSaferElements.forEach(el => el.remove());
    
    // 既存の変換画像を削除（IDでも削除）
    const existingSaferImage = dropZone.querySelector('#saferImage');
    if (existingSaferImage) {
        existingSaferImage.remove();
    }
    
    // ローディング表示
    const loadingMsg = document.createElement('p');
    loadingMsg.className = 'risk-loading';
    loadingMsg.textContent = 'リスクカラーを分析中...';
    loadingMsg.style.color = '#666';
    loadingMsg.style.marginTop = '20px';
    dropZone.appendChild(loadingMsg);
    
    // リスクカラーを検出
    detectAndMarkRiskyColors(imageElement)
        .then(result => {
            loadingMsg.remove();
            
            // 警告メッセージを表示
            if (result.riskyPixelCount > 0) {
                const warning = document.createElement('div');
                warning.className = 'risk-warning';
                warning.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    width: 100%;
                `;
                warning.innerHTML = `
                    <p style="color: #C62828; font-weight: bold; margin: 20px 0 10px;">
                        警告：画像全体の ${result.totalPixels.toLocaleString()} ピクセルうち、${result.riskyPixelCount.toLocaleString()} ピクセル（${result.riskyPercentage}）％がリスクカラーです。
                    </p>
                    <p style="color: #666; font-size: 14px; margin-bottom: 10px;">
                        CMYK変換時に色が大きく変化する可能性があります。下にリスクカラーを赤で表示した画像を示します。
                    </p>
                `;
                dropZone.appendChild(warning);
                
                // ダウンロードボタンを追加
                const downloadButton = document.createElement('button');
                downloadButton.textContent = 'リスクカラー警告画像をダウンロード';
                downloadButton.style.cssText = `
                    margin-top: 15px;
                    margin-bottom: 10px;
                    padding: 10px 20px;
                    background-color: #C62828;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
                    display: block;
                    margin-left: auto;
                    margin-right: auto;
                `;
                downloadButton.addEventListener('mouseenter', function() {
                    this.style.backgroundColor = '#A02020';
                });
                downloadButton.addEventListener('mouseleave', function() {
                    this.style.backgroundColor = '#C62828';
                });
                downloadButton.addEventListener('click', async function() {
                    // canvasをBlobに変換
                    result.canvas.toBlob(async function(blob) {
                        if (blob) {
                            await saveFileWithDialog(blob, 'risk_color_warning.png');
                        }
                    }, 'image/png');
                });
                warning.appendChild(downloadButton);
                
                // リスクカラーを赤で表示した画像を追加
                const riskImage = document.createElement('img');
                riskImage.id = 'riskImage';
                riskImage.src = result.canvas.toDataURL();
                riskImage.style.maxWidth = '900px';
                riskImage.style.width = '100%';
                riskImage.style.height = 'auto';
                riskImage.style.marginTop = '20px';
                riskImage.style.border = '2px solid #C62828';
                riskImage.style.borderRadius = '8px';
                dropZone.appendChild(riskImage);
                
                // リスクカラーをリスクの少ないカラーに変換した画像を生成して表示
                convertRiskyColorsToSafer(imageElement)
                    .then(saferCanvas => {
                        // 既存の変換関連要素を削除（念のため再度削除）
                        const existingSaferElements = dropZone.querySelectorAll('.safer-conversion-element');
                        existingSaferElements.forEach(el => el.remove());
                        
                        // 参考用の説明文を追加
                        const saferLabel = document.createElement('p');
                        saferLabel.className = 'safer-conversion-element';
                        saferLabel.textContent = '参考：リスクカラーをリスクの少ないカラーに変換した画像';
                        saferLabel.style.cssText = `
                            color: #666;
                            font-size: 14px;
                            margin-top: 30px;
                            margin-bottom: 10px;
                            font-weight: bold;
                        `;
                        dropZone.appendChild(saferLabel);
                        
                        // ダウンロードボタンを追加
                        const saferDownloadButton = document.createElement('button');
                        saferDownloadButton.className = 'safer-conversion-element';
                        saferDownloadButton.textContent = '変換後の画像をダウンロード';
                        saferDownloadButton.style.cssText = `
                            margin-top: 10px;
                            margin-bottom: 10px;
                            padding: 10px 20px;
                            background-color: #2E7D32;
                            color: white;
                            border: none;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: bold;
                        `;
                        saferDownloadButton.addEventListener('mouseenter', function() {
                            this.style.backgroundColor = '#1B5E20';
                        });
                        saferDownloadButton.addEventListener('mouseleave', function() {
                            this.style.backgroundColor = '#2E7D32';
                        });
                        saferDownloadButton.addEventListener('click', async function() {
                            // canvasをBlobに変換
                            saferCanvas.toBlob(async function(blob) {
                                if (blob) {
                                    await saveFileWithDialog(blob, 'risk_color_converted.png');
                                }
                            }, 'image/png');
                        });
                        dropZone.appendChild(saferDownloadButton);
                        
                        // 変換した画像を追加
                        const saferImage = document.createElement('img');
                        saferImage.id = 'saferImage';
                        saferImage.className = 'safer-conversion-element';
                        saferImage.src = saferCanvas.toDataURL();
                        saferImage.style.maxWidth = '900px';
                        saferImage.style.width = '100%';
                        saferImage.style.height = 'auto';
                        saferImage.style.marginTop = '10px';
                        saferImage.style.border = '2px solid #2E7D32';
                        saferImage.style.borderRadius = '8px';
                        dropZone.appendChild(saferImage);
                        
                        // 調整内容の要約を追加
                        const summaryText = document.createElement('p');
                        summaryText.className = 'safer-conversion-element';
                        summaryText.textContent = `この画像では、検出されたリスクカラーのピクセル（${result.riskyPixelCount.toLocaleString()}ピクセル、${result.riskyPercentage}%）を、元の色調を88%保持しつつ12%だけグレーとブレンドすることで、CMYK変換時の色変化リスクを低減しています。リスクカラーは主に鮮やかな緑、シアン、青、マゼンタ系の色で、RGBからCMYKへの変換時に色が大きく変化する可能性があります。この変換により、印刷時の色の再現性が向上します。`;
                        summaryText.style.cssText = `
                            color: #666;
                            font-size: 11px;
                            margin-top: 15px;
                            margin-bottom: 20px;
                            line-height: 1.6;
                            max-width: 900px;
                        `;
                        dropZone.appendChild(summaryText);
                    })
                    .catch(error => {
                        console.error('リスクカラー変換エラー:', error);
                    });
            } else {
                const safeMsg = document.createElement('p');
                safeMsg.className = 'risk-safe';
                safeMsg.textContent = '✓ リスクカラーは検出されませんでした。';
                safeMsg.style.color = '#2E7D32';
                safeMsg.style.fontWeight = 'bold';
                safeMsg.style.marginTop = '20px';
                dropZone.appendChild(safeMsg);
            }
        })
        .catch(error => {
            loadingMsg.remove();
            console.error('リスクカラー検出エラー:', error);
            const errorMsg = document.createElement('p');
            errorMsg.className = 'risk-error';
            errorMsg.textContent = 'リスクカラーの検出中にエラーが発生しました。';
            errorMsg.style.color = '#C62828';
            errorMsg.style.marginTop = '20px';
            dropZone.appendChild(errorMsg);
        });
}

// 画像が表示されたときに自動的に分析を実行
document.addEventListener('DOMContentLoaded', async function() {
    // リスクカラーCSVを読み込む
    await loadRiskyColors();
    
    // 既存の画像読み込みイベントを監視
    const previewImage = document.getElementById('previewImage');
    
    if (previewImage) {
        // 画像が読み込まれたときに分析を実行
        previewImage.addEventListener('load', function() {
            // 少し遅延させてから分析（画像が完全に表示された後）
            setTimeout(() => {
                analyzeImageForRiskyColors();
            }, 100);
        });
    }
    
    // MutationObserverで画像の追加を監視
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1 && node.id === 'previewImage') {
                    node.addEventListener('load', function() {
                        setTimeout(() => {
                            analyzeImageForRiskyColors();
                        }, 100);
                    });
                }
            });
        });
    });
    
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        observer.observe(dropZone, { childList: true });
    }
});

// 手動で分析を実行する関数（外部から呼び出し可能）
window.analyzeRiskyColors = analyzeImageForRiskyColors;

