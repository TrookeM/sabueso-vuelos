from flask import Flask, render_template, request, jsonify
from apscheduler.schedulers.background import BackgroundScheduler
import requests
import datetime
import urllib.parse
import os
from dotenv import load_dotenv

# Cargar los secretos desde el archivo .env
load_dotenv()

app = Flask(__name__)

# ==========================================================
# 🔑 TUS CLAVES SECRETAS (Cargadas desde .env)
# ==========================================================
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
SERPAPI_KEY = os.getenv("SERPAPI_KEY")
# ==========================================================

config = {
    "origenes": "ALC,VLC,MAD",
    "destino": "KRK", 
    "fecha_ida": "2026-03-26", 
    "fecha_vuelta": "2026-04-02", 
    "pasajeros": 2,
    "precio_maximo_pp": 200 
}

def buscar_en_api(conf):
    url = "https://serpapi.com/search.json"
    resultados = []
    origenes_lista = [o.strip() for o in conf["origenes"].split(",")]
    destino_final = conf["destino"].strip().upper()
    
    if not conf["fecha_ida"]:
        return {"error": True, "mensaje": "Google Flights requiere una fecha de Ida exacta (YYYY-MM-DD)."}

    for origen in origenes_lista:
        params = {
            "engine": "google_flights",
            "departure_id": origen,
            "arrival_id": destino_final,
            "outbound_date": conf["fecha_ida"],
            "currency": "EUR",
            "hl": "es",
            "adults": conf["pasajeros"],
            "api_key": SERPAPI_KEY
        }
        if conf["fecha_vuelta"]:
            params["return_date"] = conf["fecha_vuelta"]
            
        try:
            response = requests.get(url, params=params)
            data = response.json()
            
            if "error" in data: continue
            
            nivel_precio = "⚪ Info no disp."
            if "price_insights" in data:
                nivel = data["price_insights"].get("price_level", "")
                if nivel == "low": nivel_precio = "🟢 BARATO"
                elif nivel == "typical": nivel_precio = "🟡 NORMAL"
                elif nivel == "high": nivel_precio = "🔴 CARO"
                
            vuelos_encontrados = data.get("best_flights", []) + data.get("other_flights", [])
            
            for vuelo in vuelos_encontrados:
                precio_total = vuelo.get("price", 0)
                if not precio_total: continue
                
                precio_pp = precio_total / int(conf["pasajeros"])
                tramos = vuelo.get("flights", [])
                aerolinea = tramos[0].get("airline", "Varias") if tramos else "Desconocida"
                
                try:
                    fecha_real = tramos[0]["departure_airport"]["time"].split(" ")[0]
                except:
                    fecha_real = conf["fecha_ida"]
                
                query_vuelo = f"Vuelos desde {origen} a {destino_final} el {conf['fecha_ida']}"
                if conf["fecha_vuelta"]:
                    query_vuelo += f" y vuelta el {conf['fecha_vuelta']}"
                enlace_google = f"https://www.google.com/travel/flights?q={urllib.parse.quote(query_vuelo)}"
                
                resultados.append({
                    "origen": origen, "destino": destino_final, "fecha_detectada": fecha_real,
                    "aerolinea": aerolinea, "precio_total": round(precio_total, 2),
                    "precio_pp": round(precio_pp, 2), "estado_precio": nivel_precio, "enlace": enlace_google
                })
        except Exception as e:
            return {"error": True, "mensaje": f"Fallo al conectar con Google Flights."}
            
    resultados_filtrados = [r for r in resultados if r["precio_pp"] <= float(conf["precio_maximo_pp"])]
    return sorted(resultados_filtrados, key=lambda x: x["precio_pp"])

def tarea_en_segundo_plano():
    vuelos = buscar_en_api(config)
    if isinstance(vuelos, list) and len(vuelos) > 0:
        mejor_vuelo = vuelos[0]
        mensaje = (
            f"🚨 <b>¡CHOLLO DETECTADO!</b> 🚨\n\n"
            f"✈️ Ruta: <b>{mejor_vuelo['origen']} ➡️ {mejor_vuelo['destino']}</b>\n"
            f"📊 Estado: {mejor_vuelo['estado_precio']}\n"
            f"👤 Precio/Pers: {mejor_vuelo['precio_pp']}€\n\n"
            f"🔗 <a href='{mejor_vuelo['enlace']}'>Ver en Google Flights</a>"
        )
        url_tg = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
        requests.post(url_tg, data={"chat_id": TELEGRAM_CHAT_ID, "text": mensaje, "parse_mode": "HTML"})

scheduler = BackgroundScheduler()
scheduler.add_job(func=tarea_en_segundo_plano, trigger="interval", hours=24)
scheduler.start()

@app.route('/')
def index():
    return render_template('index.html', config=config)

@app.route('/api/guardar', methods=['POST'])
def guardar_config():
    global config
    config.update(request.json)
    return jsonify({"status": "success", "message": "✅ Configuración guardada."})

@app.route('/api/buscar', methods=['GET'])
def buscar_ahora():
    return jsonify(buscar_en_api(config))

@app.route('/api/test_telegram', methods=['POST'])
def test_telegram():
    mensaje = "🤖 <b>Prueba de conexión</b>\n\nTu bot está enviando notificaciones correctamente."
    url_tg = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    res = requests.post(url_tg, data={"chat_id": TELEGRAM_CHAT_ID, "text": mensaje, "parse_mode": "HTML"})
    if res.status_code == 200:
        return jsonify({"status": "success", "message": "¡Mensaje enviado!"})
    return jsonify({"status": "error", "message": "Error al conectar con Telegram."})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)