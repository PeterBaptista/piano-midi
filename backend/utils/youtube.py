import yt_dlp
import os
import tempfile
import glob

def download_youtube_audio_bytes(url: str) -> bytes:
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'quiet': True,
        'no_warnings': True,
    }

    with tempfile.TemporaryDirectory() as temp_dir:
        ydl_opts['outtmpl'] = os.path.join(temp_dir, '%(id)s.%(ext)s')
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
            
            arquivos = glob.glob(os.path.join(temp_dir, "*.mp3"))
            if not arquivos:
                raise FileNotFoundError("O arquivo de áudio não foi gerado corretamente.")
                
            caminho_arquivo = arquivos[0]
            
            with open(caminho_arquivo, "rb") as f:
                audio_bytes = f.read()
                
            return audio_bytes

        except Exception as e:
            raise RuntimeError(f"Falha ao baixar áudio: {str(e)}")


