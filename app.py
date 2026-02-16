from flask import Flask, render_template, request, jsonify
from apscheduler.schedulers.background import BackgroundScheduler
import requests
import datetime
import urllib.parse
import os
import json
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# ==========================================================
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
SERPAPI_KEY = os.getenv("SERPAPI_KEY")
# ==========================================================

# Configuración actualizada para listas
config = {
    "origenes": "ALC,MAD",
    "destinos": "KRK,WAW", # Ahora en plural
    "fechas_ida": "2026-03-26,2026-04-10", # Varias fechas separadas por coma
    "fechas_vuelta": "2026-04-02,2026-04-17", # Deben coincidir en orden con las de ida
    "pasajeros": 2,
    "precio_maximo_pp": 200 
}

def buscar_en_api(conf):
    url = "https://serpapi.com/search.json"
    resultados = []
    
    # Preparamos las listas
    origenes_lista = [o.strip() for o in conf["origenes"].split(",") if o.strip()]
    destinos_lista = [d.strip().upper() for d in conf["destinos"].split(",") if d.strip()]
    fechas_ida = [f.strip() for f in conf["fechas_ida"].split(",") if f.strip()]
    fechas_vuelta = [f.strip() for f in conf["fechas_vuelta"].split(",")] if conf.get("fechas_vuelta") else []

    if not fechas_ida:
        return {"error": True, "mensaje": "Se requiere al menos una fecha de ida."}

    # BUCLE TRIPLE: Por cada origen, hacia cada destino, en cada fecha
    for origen in origenes_lista:
        for destino in destinos_lista:
            for idx, f_ida in enumerate(fechas_ida):
                # Asignar la fecha de vuelta correspondiente (si existe)
                f_vuelta = fechas_vuelta[idx] if idx < len(fechas_vuelta) and fechas_vuelta[idx].strip() else None
                
                params = {
                    "engine": "google_flights",
                    "departure_id": origen,
                    "arrival_id": destino,
                    "outbound_date": f_ida,
                    "currency": "EUR",
                    "hl": "es",
                    "adults": conf["pasajeros"],
                    "api_key": SERPAPI_KEY
                }
                if f_vuelta: params["return_date"] = f_vuelta
                    
                try:
                    response = requests.get(url, params=params)
                    data = response.json()
                    
                    if "error" in data: continue
                    
                    nivel_precio = "⚪ Normal"
                    if "price_insights" in data:
                        nivel = data["price_insights"].get("price_level", "")
                        if nivel == "low": nivel_precio = "🟢 BARATO"
                        elif nivel == "high": nivel_precio = "🔴 CARO"
                        
                    vuelos = data.get("best_flights", []) + data.get("other_flights", [])
                    
                    for vuelo in vuelos:
                        precio_total = vuelo.get("price", 0)
                        if not precio_total: continue
                        precio_pp = precio_total / int(conf["pasajeros"])
                        
                        tramos = vuelo.get("flights", [])
                        aerolinea = tramos[0].get("airline", "Varias") if tramos else "N/A"
                        
                        query_vuelo = f"Vuelos desde {origen} a {destino} el {f_ida}"
                        if f_vuelta: query_vuelo += f" y vuelta el {f_vuelta}"
                        enlace_google = f"https://www.google.com/travel/flights?q={urllib.parse.quote(query_vuelo)}"
                        
                        resultados.append({
                            "origen": origen, "destino": destino, "fecha_detectada": f_ida,
                            "aerolinea": aerolinea, "precio_total": round(precio_total, 2),
                            "precio_pp": round(precio_pp, 2), "estado_precio": nivel_precio, "enlace": enlace_google
                        })
                except Exception as e:
                    print(f"Error en {origen}-{destino}: {e}")
                    
    # Filtramos por presupuesto y ordenamos de más barato a más caro
    resultados_filtrados = [r for r in resultados if r["precio_pp"] <= float(conf["precio_maximo_pp"])]
    return sorted(resultados_filtrados, key=lambda x: x["precio_pp"])

def guardar_historial(vuelos):
    archivo = "historial.json"
    historial = []
    if os.path.exists(archivo):
        try:
            with open(archivo, 'r') as f: historial = json.load(f)
        except: pass
        
    if isinstance(vuelos, list):
        # Guardamos un resumen de los 5 mejores vuelos para poder filtrarlos en la web
        mejores = [f"{v['origen']}-{v['destino']} ({v['fecha_detectada']}): {v['precio_pp']}€" for v in vuelos[:5]]
        registro = {
            "fecha": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "vuelos_encontrados": len(vuelos),
            "detalle": " | ".join(mejores) if mejores else "Ninguno bajo presupuesto"
        }
    else:
        registro = {"fecha": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"), "vuelos_encontrados": 0, "detalle": "Error en API"}
    
    historial.insert(0, registro)
    historial = historial[:50] # Ampliado a 50 registros
    with open(archivo, 'w') as f: json.dump(historial, f, indent=4)

def tarea_en_segundo_plano():
    print(f"[{datetime.datetime.now()}] 🔍 Batida múltiple en progreso...")
    vuelos = buscar_en_api(config)
    guardar_historial(vuelos)
    
    if isinstance(vuelos, list) and len(vuelos) > 0:
        # Telegram agrupará los 3 mejores chollos para no spamearte
        mensaje = "🚨 <b>¡NUEVOS CHOLLOS DETECTADOS!</b> 🚨\n\n"
        for v in vuelos[:3]:
            mensaje += f"✈️ <b>{v['origen']} ➡️ {v['destino']}</b> ({v['fecha_detectada']})\n"
            mensaje += f"💶 Precio: {v['precio_pp']}€ - {v['estado_precio']}\n"
            mensaje += f"🔗 <a href='{v['enlace']}'>Ver vuelo</a>\n\n"
            
        url_tg = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
        requests.post(url_tg, data={"chat_id": TELEGRAM_CHAT_ID, "text": mensaje, "parse_mode": "HTML"})

scheduler = BackgroundScheduler()
scheduler.add_job(func=tarea_en_segundo_plano, trigger="interval", hours=24)
scheduler.start()

@app.route('/')
def index(): return render_template('index.html', config=config)

@app.route('/api/guardar', methods=['POST'])
def guardar_config():
    global config
    config.update(request.json)
    return jsonify({"status": "success", "message": "✅ Configuración multi-ruta guardada."})

@app.route('/api/buscar', methods=['GET'])
def buscar_ahora(): return jsonify(buscar_en_api(config))

@app.route('/api/historial', methods=['GET'])
def ver_historial():
    if os.path.exists("historial.json"):
        with open("historial.json", 'r') as f: return jsonify(json.load(f))
    return jsonify([])

@app.route('/api/test_telegram', methods=['POST'])
def test_telegram():
    res = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", data={"chat_id": TELEGRAM_CHAT_ID, "text": "🤖 Test OK"})
    if res.status_code == 200: return jsonify({"status": "success", "message": "¡Mensaje enviado!"})
    return jsonify({"status": "error", "message": "Error al conectar."})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)