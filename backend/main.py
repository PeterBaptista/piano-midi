import os
import zipfile
import io
import tempfile
import glob
import shutil
import uuid
import yt_dlp
from flask import Flask, jsonify, send_file, request
from flask_cors import CORS
from dotenv import load_dotenv

from musicai_sdk import MusicAiClient
from basic_pitch.inference import predict
from basic_pitch import ICASSP_2022_MODEL_PATH
import pretty_midi
import traceback

from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_bcrypt import Bcrypt
from models import db, User, Job 

# ------------------------
# Setup and configuration
# ------------------------
load_dotenv()
app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///music_app.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv("JWT_SECRET_KEY", "chavesecreta")

db.init_app(app)
jwt = JWTManager(app)

bcrypt = Bcrypt(app)

with app.app_context():
    db.create_all()

MUSICAI_API_KEY = os.getenv("MUSICAI_API_KEY")
MUSICAI_WORKFLOW_TITLE = os.getenv("MUSICAI_WORKFLOW_TITLE")
MUSICAI_WORKFLOW_SLUG = os.getenv("MUSICAI_WORKFLOW_SLUG")
music_ai = MusicAiClient(api_key=MUSICAI_API_KEY)
# Cache directory for downloaded audio and generated ZIP/MIDI
CACHE_DIR = os.path.join(os.getcwd(), ".cache")
os.makedirs(CACHE_DIR, exist_ok=True)


def video_cache_dir(video_id: str) -> str:
    path = os.path.join(CACHE_DIR, video_id)
    os.makedirs(path, exist_ok=True)
    return path


def cached_paths_for_video(video_id: str):
    d = video_cache_dir(video_id)
    # try to discover existing piano stem with common extensions
    audio_exts = ['.mp3', '.wav', '.m4a', '.flac']
    piano_candidate = None
    for fn in os.listdir(d):
        lower = fn.lower()
        if 'piano' in lower or 'stem' in lower:
            for ext in audio_exts:
                if lower.endswith(ext):
                    piano_candidate = os.path.join(d, fn)
                    break
        if piano_candidate:
            break

    default_piano = os.path.join(d, f"{video_id}_piano.mp3")
    return {
        'dir': d,
        'full_mp3': os.path.join(d, f"{video_id}.mp3"),
        'piano_stem': piano_candidate or default_piano,
        'midi': os.path.join(d, f"{video_id}.mid"),
    }

def extract_youtube_id(url: str) -> str:
    """Tenta extrair o id do vídeo do YouTube a partir da URL."""
    # exemplos: https://www.youtube.com/watch?v=ID, https://youtu.be/ID
    try:
        if "v=" in url:
            # pega parâmetro v
            import urllib.parse as _up
            q = _up.urlparse(url)
            params = _up.parse_qs(q.query)
            vid = params.get("v", [None])[0]
            if vid:
                return vid
        # youtu.be/ID
        if "youtu.be/" in url:
            parts = url.split("youtu.be/")
            if len(parts) > 1:
                return parts[1].split("?")[0]
    except Exception:
        pass
    # fallback: hash the URL
    import hashlib as _hash
    return _hash.sha1(url.encode("utf-8")).hexdigest()[:16]

# ------------------------
# Rotas de Autenticação
# ------------------------

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password') or not data.get('email'):
        return jsonify({"msg": "Dados incompletos"}), 400

    if User.query.filter_by(username=data['username']).first():
        return jsonify({"msg": "Usuário já existe"}), 400
    
    if User.query.filter_by(email=data['email']).first():
        return jsonify({"msg": "Email já cadastrado"}), 400

    hashed_password = bcrypt.generate_password_hash(data['password']).decode('utf-8')

    new_user = User(
        username=data['username'],
        email=data['email'],
        password_hash=hashed_password
    )

    try:
        db.session.add(new_user)
        db.session.commit()
        return jsonify({"msg": "Usuário criado com sucesso!"}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()

    if not data or not data.get('username') or not data.get('password'):
        return jsonify({"msg": "Dados incompletos"}), 400

    user = User.query.filter_by(username=data['username']).first()

    if user and bcrypt.check_password_hash(user.password_hash, data['password']):
        access_token = create_access_token(identity=str(user.id))
        return jsonify({
            "msg": "Login realizado com sucesso",
            "access_token": access_token,
            "user": {"username": user.username, "email": user.email}
        }), 200
    
    return jsonify({"msg": "Usuário ou senha inválidos"}), 401

@app.route('/meus-dados', methods=['GET'])
@jwt_required()
def get_user_data():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    return jsonify({
        "id": user.id,
        "username": user.username,
        "email": user.email
    }), 200

# ------------------------
# Funções Utilitárias
# ------------------------

def download_youtube_audio_bytes(url: str) -> bytes:
    """
    Baixa o áudio do YouTube e retorna os bytes brutos.
    Requer FFmpeg instalado no sistema.
    """
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

def filter_piano_stem(result_files: dict) -> dict:
    """
    Tenta retornar apenas o(s) arquivo(s) de stem de piano a partir do dicionário
    retornado pelo serviço (por exemplo: job_result['results'] ou similar).
    Retorna um dicionário possuindo apenas chaves relacionadas ao piano.
    Se não encontrar nenhum piano, retorna um dicionário vazio (não processar o mix completo).
    """
    if not result_files:
        return {}

    # 1) chave que contenha 'piano'
    for k in result_files.keys():
        if 'piano' in k.lower():
            return {k: result_files[k]}

    # 2) às vezes o valor é um dict com nome/filename/path
    piano_candidates = {}
    for k, v in result_files.items():
        name = ''
        if isinstance(v, str):
            name = v
        elif isinstance(v, dict):
            name = v.get('name') or v.get('filename') or v.get('fileName') or v.get('path') or ''
        if 'piano' in str(name).lower():
            piano_candidates[k] = v

    if piano_candidates:
        return piano_candidates

    # Nenhum piano encontrado — não retornar o mix completo
    print('[WARN] filter_piano_stem: nenhum stem de piano identificado nos resultados')
    return {}

def generate_midi_from_audio(stem_path: str, output_dir: str) -> str:
    """Gera MIDI otimizado para PIANO CLÁSSICO."""
    midi_file_name = os.path.splitext(os.path.basename(stem_path))[0] + '.mid'
    midi_output_path = os.path.join(output_dir, midi_file_name)

    print(f"[DEBUG] Gerando MIDI para: {stem_path}")
    try:
        model_output, midi_data, note_events = predict(
            stem_path, 
            ICASSP_2022_MODEL_PATH,
            onset_threshold=0.6, 
            frame_threshold=0.3,
            minimum_note_length=50,
            minimum_frequency=27.5,
            maximum_frequency=4186.0
        )

        piano_program = pretty_midi.instrument_name_to_program('Acoustic Grand Piano')
        
        for instrument in midi_data.instruments:
            instrument.program = piano_program
            instrument.is_drum = False
            instrument.pitch_bends = []

        midi_data.write(midi_output_path)
        return midi_output_path

    except Exception as e:
        print(f"[WARN] Erro ao gerar MIDI para {stem_path}: {e}")
        return None

def create_zip_with_midi(result_files: dict) -> io.BytesIO:
    with tempfile.TemporaryDirectory() as output_dir:
        piano_files_map = filter_piano_stem(result_files)

        if not piano_files_map:
            print('[WARN] create_zip_with_midi: nenhum stem de piano para baixar; retornando zip vazio')
            memory_zip = io.BytesIO()
            with zipfile.ZipFile(memory_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
                pass
            memory_zip.seek(0)
            return memory_zip

        print("[INFO] Baixando stem de piano...")
        local_files = music_ai.download_job_results(piano_files_map, output_dir)

        print("[INFO] Gerando MIDI de alta precisão (apenas piano)...")
        for stem_path in local_files.values():
            generate_midi_from_audio(stem_path, output_dir)

        print("[INFO] Zipando resultados...")
        memory_zip = io.BytesIO()
        with zipfile.ZipFile(memory_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
            for file_name in os.listdir(output_dir):
                full_path = os.path.join(output_dir, file_name)
                zipf.write(full_path, arcname=file_name)

        memory_zip.seek(0)
        return memory_zip


def create_first_midi_bytes(result_files: dict, cache_dir: str = None):
    """Gera MIDIs a partir dos stems e retorna os bytes do primeiro arquivo .mid gerado e seu nome.
    Se `cache_dir` for fornecido, os stems e MIDIs são gravados nessa pasta (persistente).
    """
    use_temp = cache_dir is None
    if use_temp:
        work_dir_ctx = tempfile.TemporaryDirectory()
        output_dir = work_dir_ctx.__enter__()
    else:
        output_dir = cache_dir

    try:
        # Normaliza input: às vezes `result_files` é o job_result completo e as chaves reais
        # estão sob 'results', 'artifacts' ou 'outputs'. Tentamos extrair o dicionário de arquivos.
        candidates = None
        if not isinstance(result_files, dict):
            print('[WARN] create_first_midi_bytes: result_files inesperado (não dict)')
            return None, None

        for key in ('results', 'artifacts', 'files', 'outputs'):
            if key in result_files and isinstance(result_files[key], dict):
                candidates = result_files[key]
                break

        if candidates is None:
            # se não encontrou sub-dict, assume que recebeu diretamente o map
            candidates = result_files

        piano_files_map = filter_piano_stem(candidates)

        if not piano_files_map:
            # tentativa: se um cache_dir foi fornecido, procurar por arquivos locais *_piano.*
            if cache_dir:
                print(f"[INFO] Nenhum piano no resultado remoto; buscando arquivos locais em {cache_dir}")
                piano_glob = glob.glob(os.path.join(cache_dir, "**", "*_piano.*"), recursive=True)
                if not piano_glob:
                    piano_glob = glob.glob(os.path.join(cache_dir, "**", "*piano*.*"), recursive=True)
                if piano_glob:
                    # montar um mapa semelhante ao que music_ai.download_job_results retornaria
                    local_files = {}
                    for i, p in enumerate(piano_glob):
                        local_files[f"piano_{i}"] = p
                    print(f"[INFO] Encontrados stems locais: {piano_glob}")
                else:
                    print('[WARN] create_first_midi_bytes: nenhum stem de piano detectado; abortando geração de MIDI')
                    return None, None
            else:
                print('[WARN] create_first_midi_bytes: nenhum stem de piano detectado; abortando geração de MIDI')
                return None, None
        else:
            print("[INFO] Baixando stem de piano para gerar MIDI...")
            try:
                # Passamos o job/result completo para a SDK (evita KeyError 'status')
                all_local = music_ai.download_job_results(result_files, output_dir)
            except Exception as e:
                print(f"[ERROR] Falha ao baixar stems de piano: {e}")
                print("[TRACE] Traceback (mais detalhes):")
                traceback.print_exc()
                all_local = {}

            # Filtra apenas os arquivos locais que contenham 'piano' no nome
            local_files = {}
            for k, v in (all_local or {}).items():
                candidate_name = os.path.basename(v).lower() if isinstance(v, str) else str(k).lower()
                if 'piano' in candidate_name or 'piano' in str(k).lower():
                    local_files[k] = v

            # Se não encontrou nenhum stem remoto, tentar usar arquivos locais em cache_dir
            if not local_files:
                if cache_dir:
                    piano_glob = glob.glob(os.path.join(cache_dir, "**", "*_piano.*"), recursive=True)
                    if not piano_glob:
                        piano_glob = glob.glob(os.path.join(cache_dir, "**", "*piano*.*"), recursive=True)
                    if piano_glob:
                        local_files = {f"piano_{i}": p for i, p in enumerate(piano_glob)}
                        print(f"[INFO] Usando stems locais como fallback: {piano_glob}")
                    else:
                        print('[WARN] create_first_midi_bytes: nenhum stem de piano encontrado após download e fallback local')
                        return None, None
                else:
                    print('[WARN] create_first_midi_bytes: nenhum stem de piano encontrado após download')
                    return None, None

        # If using a cache_dir, normalize the downloaded stem name to a consistent piano_stem path
        if cache_dir:
            # pick first downloaded file
            downloaded = None
            for p in local_files.values():
                downloaded = p
                break
            if downloaded:
                _, ext = os.path.splitext(downloaded)
                video_id = os.path.basename(cache_dir.rstrip(os.sep))
                piano_target = os.path.join(cache_dir, f"{video_id}_piano{ext}")
                try:
                    os.replace(downloaded, piano_target)
                except Exception:
                    try:
                        shutil.copy(downloaded, piano_target)
                    except Exception:
                        piano_target = downloaded
                # update local_files to point to piano_target
                local_files = {k: (piano_target if p == downloaded else p) for k, p in local_files.items()}

        print("[INFO] Gerando MIDI de alta precisão...")
        for stem_path in local_files.values():
            generate_midi_from_audio(stem_path, output_dir)

        # procurar arquivos .mid no output_dir
        midi_files = [os.path.join(output_dir, f) for f in os.listdir(output_dir) if f.lower().endswith('.mid')]
        if not midi_files:
            return None, None

        first = midi_files[0]
        with open(first, 'rb') as f:
            data = f.read()

        return data, os.path.basename(first)
    finally:
        if use_temp:
            work_dir_ctx.__exit__(None, None, None)

@app.route("/process-youtube", methods=["POST"])
@jwt_required()
def process_youtube():
    """
    Recebe link youtube, baixa, envia pra MusicAI e salva Job no banco.
    """
    current_user_id = get_jwt_identity()
    data = request.get_json()
    youtube_url = data.get("url")

    if not youtube_url:
        return jsonify({"error": "URL é obrigatória"}), 400

    try:
        print(f"[INFO] Baixando do YouTube: {youtube_url}")
        video_id = extract_youtube_id(youtube_url)

        # Paths for this video (per-video cache folder)
        paths = cached_paths_for_video(video_id)

        # Fallback order: MIDI -> piano stem -> full mp3 -> download+MusicAI
        if os.path.exists(paths['midi']):
            print(f"[INFO] MIDI em cache encontrado: {paths['midi']}. Pulando reprocessamento.")
            existing = Job.query.filter_by(youtube_url=youtube_url).order_by(Job.id.desc()).first()
            if existing:
                return jsonify({"message": "Já processado (cache)", "job_id": existing.musicai_job_id, "status": "SUCCEEDED"}), 200

            synthetic_id = str(uuid.uuid4())
            new_job = Job(
                musicai_job_id=synthetic_id,
                youtube_url=youtube_url,
                status="SUCCEEDED",
                user_id=current_user_id
            )
            db.session.add(new_job)
            db.session.commit()
            return jsonify({"message": "Já processado (cache)", "job_id": synthetic_id, "status": "SUCCEEDED"}), 200

        # If piano stem exists, generate MIDI from it (no need to call MusicAI)
        if os.path.exists(paths['piano_stem']):
            print(f"[INFO] Encontrado piano stem em cache: {paths['piano_stem']}. Gerando MIDI localmente.")
            midi_out = generate_midi_from_audio(paths['piano_stem'], paths['dir'])
            if midi_out:
                # ensure DB record exists
                existing = Job.query.filter_by(youtube_url=youtube_url).order_by(Job.id.desc()).first()
                if existing:
                    job_id = existing.musicai_job_id
                else:
                    job_id = str(uuid.uuid4())
                    new_job = Job(
                        musicai_job_id=job_id,
                        youtube_url=youtube_url,
                        status="SUCCEEDED",
                        user_id=current_user_id
                    )
                    db.session.add(new_job)
                    db.session.commit()
                # move or rename generated midi to canonical path
                gen_midi_path = os.path.join(paths['dir'], os.path.basename(midi_out)) if midi_out else None
                if gen_midi_path and os.path.exists(gen_midi_path):
                    try:
                        # replace canonical midi file with piano-generated midi
                        os.replace(gen_midi_path, paths['midi'])
                        # remove any leftover piano-specific midi to avoid duplicates
                        piano_specific = os.path.join(paths['dir'], f"{video_id}_piano.mid")
                        if os.path.exists(piano_specific) and piano_specific != paths['midi']:
                            try:
                                os.remove(piano_specific)
                            except Exception:
                                pass
                    except Exception:
                        pass
                return jsonify({"message": "MIDI gerado localmente", "job_id": job_id, "status": "SUCCEEDED"}), 200

        # Check cache for downloaded audio (full mp3)
        cached_audio_path = paths['full_mp3']
        if os.path.exists(cached_audio_path):
            print(f"[INFO] Usando áudio em cache: {cached_audio_path}")
            with open(cached_audio_path, "rb") as f:
                audio_bytes = f.read()
            # write to a temp file for upload
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as temp_audio:
                temp_audio.write(audio_bytes)
                temp_path = temp_audio.name
        else:
            audio_bytes = download_youtube_audio_bytes(youtube_url)
            with open(cached_audio_path, "wb") as cf:
                cf.write(audio_bytes)
            print(f"[INFO] Áudio salvo em cache: {cached_audio_path}")
            # write to a temp file for upload
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as temp_audio:
                temp_audio.write(audio_bytes)
                temp_path = temp_audio.name

        print("[INFO] Enviando para MusicAI...")
        song_url = music_ai.upload_file(temp_path)
        os.unlink(temp_path)

        print("[INFO] Iniciando Job na MusicAI...")
        job = music_ai.add_job(MUSICAI_WORKFLOW_TITLE, MUSICAI_WORKFLOW_SLUG, {"inputUrl": song_url})
        job_id = job["id"]

        new_job = Job(
            musicai_job_id=job_id,
            youtube_url=youtube_url,
            status="PENDING",
            user_id=current_user_id
        )
        db.session.add(new_job)
        db.session.commit()

        return jsonify({
            "message": "Processamento iniciado",
            "job_id": job_id,
            "status": "PENDING"
        }), 201

    except Exception as e:
        print(f"[ERROR] {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/jobs/<job_id>", methods=["GET"])
@jwt_required()
def get_job_status_or_download(job_id):
    should_download = request.args.get('download') != 'false'

    try:
        # First, if we have a local job and cached ZIP, prefer that and avoid external API call
        local_job = Job.query.filter_by(musicai_job_id=job_id).first()
        if local_job and local_job.youtube_url:
            vid = extract_youtube_id(local_job.youtube_url)
            candidate = cached_paths_for_video(vid)['midi']
            if os.path.exists(candidate):
                if not should_download:
                    return jsonify({"status": "SUCCEEDED", "details": {"cached": True}})
                return send_file(
                    candidate,
                    mimetype="audio/midi",
                    as_attachment=True,
                    download_name=f"piano_midi_{job_id}.mid"
                )

        # Otherwise, fall back to remote job status
        job_result = music_ai.get_job(job_id)
        remote_status = job_result.get("status")

        print(f"[DEBUG] job_result keys: {list(job_result.keys())}")
        if 'results' in job_result and isinstance(job_result['results'], dict):
            print(f"[DEBUG] job_result['results'] keys: {list(job_result['results'].keys())}")

        if local_job and local_job.status != remote_status:
            local_job.status = remote_status
            db.session.commit()

        if remote_status == "SUCCEEDED":
            if not should_download:
                return jsonify({"status": "SUCCEEDED", "details": job_result})

            # Attempt to return cached MIDI by youtube id if available
            local_job = Job.query.filter_by(musicai_job_id=job_id).first()
            cache_mid_path = None
            if local_job and local_job.youtube_url:
                vid = extract_youtube_id(local_job.youtube_url)
                candidate = cached_paths_for_video(vid)['midi']
                if os.path.exists(candidate):
                    cache_mid_path = candidate

            if cache_mid_path:
                return send_file(
                    cache_mid_path,
                    mimetype="audio/midi",
                    as_attachment=True,
                    download_name=f"piano_midi_{job_id}.mid"
                )

            # generate and cache the first MIDI
            # generate and cache the first MIDI into video cache dir if possible
            paths = None
            if local_job and local_job.youtube_url:
                vid = extract_youtube_id(local_job.youtube_url)
                paths = cached_paths_for_video(vid)
            midi_bytes, midi_name = create_first_midi_bytes(job_result, cache_dir=(paths['dir'] if paths else None))
            if not midi_bytes:
                return jsonify({"error": "Nenhum arquivo MIDI encontrado nos resultados"}), 404
            try:
                if paths:
                    cache_mid_file = paths['midi']
                    with open(cache_mid_file, "wb") as f:
                        f.write(midi_bytes)
                    print(f"[INFO] MIDI salvo em cache: {cache_mid_file}")
                    # cleanup piano-specific midi files to avoid duplicates
                    piano_specific = os.path.join(paths['dir'], f"{vid}_piano.mid")
                    if os.path.exists(piano_specific) and piano_specific != cache_mid_file:
                        try:
                            os.remove(piano_specific)
                        except Exception:
                            pass
            except Exception as e:
                print(f"[WARN] Não foi possível gravar MIDI em cache: {e}")

            return send_file(
                io.BytesIO(midi_bytes),
                mimetype="audio/midi",
                as_attachment=True,
                download_name=f"piano_midi_{job_id}.mid"
            )
        
        elif remote_status == "FAILED":
             return jsonify({"status": "FAILED", "error": "O processamento falhou na MusicAI"}), 400
        
        else:
            return jsonify({"status": remote_status, "message": "Ainda processando..."}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/jobs/<job_id>/midi", methods=["GET"]) 
@jwt_required()
def get_job_midi(job_id):
    """
    Retorna o primeiro arquivo MIDI gerado pelo job da MusicAI como conteúdo bruto.
    Usado para importar o MIDI diretamente na UI sem precisar baixar o ZIP manualmente.
    """
    try:
        # Prefer cached ZIP by youtube id first to avoid calling external API
        local_job = Job.query.filter_by(musicai_job_id=job_id).first()
        if local_job and local_job.youtube_url:
            vid = extract_youtube_id(local_job.youtube_url)
            candidate = cached_paths_for_video(vid)['midi']
            if os.path.exists(candidate):
                with open(candidate, 'rb') as f:
                    midi_bytes = f.read()
                first_midi_name = os.path.basename(candidate)
                return send_file(
                    io.BytesIO(midi_bytes),
                    mimetype='audio/midi',
                    as_attachment=False,
                    download_name=first_midi_name
                )

        # Fall back to remote job result if no local cache
        job_result = music_ai.get_job(job_id)
        remote_status = job_result.get("status")

        if remote_status != "SUCCEEDED":
            return jsonify({"error": "Job ainda não concluído"}), 400

        # Generate the first MIDI and cache it
        # generate the first MIDI and cache it in video folder if possible
        paths = None
        if local_job and local_job.youtube_url:
            vid = extract_youtube_id(local_job.youtube_url)
            paths = cached_paths_for_video(vid)
        midi_bytes, midi_name = create_first_midi_bytes(job_result, cache_dir=(paths['dir'] if paths else None))
        if not midi_bytes:
            return jsonify({"error": "Nenhum arquivo MIDI encontrado nos resultados"}), 404

        try:
            if paths:
                cache_mid_file = paths['midi']
                with open(cache_mid_file, "wb") as f:
                    f.write(midi_bytes)
                print(f"[INFO] MIDI salvo em cache: {cache_mid_file}")
                # remove any piano-specific midi to avoid keeping duplicates
                piano_specific = os.path.join(paths['dir'], f"{vid}_piano.mid")
                if os.path.exists(piano_specific) and piano_specific != cache_mid_file:
                    try:
                        os.remove(piano_specific)
                    except Exception:
                        pass
        except Exception as e:
            print(f"[WARN] Não foi possível gravar MIDI em cache: {e}")

        return send_file(
            io.BytesIO(midi_bytes),
            mimetype='audio/midi',
            as_attachment=False,
            download_name=midi_name
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/workflows", methods=["GET"])
def list_workflows():
    try:
        workflows = music_ai.list_workflows()
        if isinstance(workflows, dict) and "data" in workflows:
            workflows = workflows["data"]
        formatted = [{"slug": w.get("slug"), "name": w.get("name")} for w in workflows]
        return jsonify({"workflows": formatted})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/separate", methods=["GET"])
def separate_music():
    try:
        input_path = "./odeon.m4a"
        if not os.path.exists(input_path):
            return jsonify({"error": "Arquivo local não encontrado"}), 404
        song_url = music_ai.upload_file(input_path)
        job = music_ai.add_job(MUSICAI_WORKFLOW_TITLE, MUSICAI_WORKFLOW_SLUG, {"inputUrl": song_url})
        job_id = job["id"]
        job_result = music_ai.wait_for_job_completion(job_id)
        if job_result["status"] != "SUCCEEDED":
            return jsonify({"error": "Job failed"}), 500
        memory_zip = create_zip_with_midi(job_result)
        return send_file(memory_zip, mimetype="application/zip", as_attachment=True, download_name=f"piano_{job_id}.zip")
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)