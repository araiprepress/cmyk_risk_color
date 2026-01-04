/**
 * 画像ダウンロード機能を提供するスクリプト
 */

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

// リスクカラー警告画像のダウンロードボタンを作成
function createRiskWarningDownloadButton(canvas, container) {
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
        canvas.toBlob(async function(blob) {
            if (blob) {
                await saveFileWithDialog(blob, 'risk_color_warning.png');
            }
        }, 'image/png');
    });
    container.appendChild(downloadButton);
    return downloadButton;
}

// 変換後の画像のダウンロードボタンを作成
function createConvertedImageDownloadButton(canvas, container) {
    const downloadButton = document.createElement('button');
    downloadButton.className = 'safer-conversion-element';
    downloadButton.textContent = '変換後の画像をダウンロード';
    downloadButton.style.cssText = `
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
    downloadButton.addEventListener('mouseenter', function() {
        this.style.backgroundColor = '#1B5E20';
    });
    downloadButton.addEventListener('mouseleave', function() {
        this.style.backgroundColor = '#2E7D32';
    });
    downloadButton.addEventListener('click', async function() {
        // canvasをBlobに変換
        canvas.toBlob(async function(blob) {
            if (blob) {
                await saveFileWithDialog(blob, 'risk_color_converted.png');
            }
        }, 'image/png');
    });
    container.appendChild(downloadButton);
    return downloadButton;
}

