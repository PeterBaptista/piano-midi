from flask import Flask

app = Flask(__name__)

@app.route("/")
def home():
    return "Hello, world!"

@app.route("/piano")
def piano():
    return "Piano"

if __name__ == "__main__":
    # Railway define a porta via variável de ambiente PORT
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
