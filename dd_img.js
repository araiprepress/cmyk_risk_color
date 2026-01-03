document.addEventListener('DOMContentLoaded', function() {
    const dropZone = document.getElementById('dropZone');
    const previewImage = document.getElementById('previewImage');
    const dropMessage = document.querySelector('.drop-message');

    // ドラッグオーバー時の処理
    dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    // ドラッグリーブ時の処理
    dropZone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
    });

    // ドロップ時の処理
    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            
            // 画像ファイルかチェック
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                
                reader.onload = function(e) {
                    previewImage.src = e.target.result;
                    previewImage.classList.add('show');
                    dropMessage.style.display = 'none';
                    
                    // 画像の読み込み後にサイズを調整
                    previewImage.onload = function() {
                        adjustImageSize();
                        // リスクカラー検出を実行（risk_color_detector.jsが読み込まれている場合）
                        if (typeof window.analyzeRiskyColors === 'function') {
                            setTimeout(() => {
                                window.analyzeRiskyColors();
                            }, 200);
                        }
                    };
                };
                
                reader.readAsDataURL(file);
            } else {
                alert('画像ファイルを選択してください。');
            }
        }
    });

    // 画像サイズの調整
    function adjustImageSize() {
        const image = previewImage;
        const naturalWidth = image.naturalWidth;
        const maxWidth = 900;

        // 横幅を900pxに制限し、縦横比を保持
        if (naturalWidth > maxWidth) {
            image.style.width = maxWidth + 'px';
            image.style.height = 'auto';
        } else {
            // 元の画像が900px以下の場合は元のサイズを維持
            image.style.width = naturalWidth + 'px';
            image.style.height = 'auto';
        }
    }
});

