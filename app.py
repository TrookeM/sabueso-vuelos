from flask import Flask, render_template, request, jsonify
import requests
import datetime
import urllib.parse
import os
import json
from dotenv import load_dotenv
import concurrent.futures

load_dotenv()

app = Flask(__name__)

# ==========================================================
# CONFIGURACIÓN Y CREDENCIALES
# ==========================================================
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
SERPAPI_KEY = os.getenv("SERPAPI_KEY")
CONFIG_FILE = "config.json"
HISTORIAL_FILE = "historial.json"
DESTINOS_EXPLORADOR = "LHR,CDG,FCO,BER,BUD,PRG,LIS,VIE,OSL,ARN,CPH,KEF,HEL"

# ==========================================================
# FUNCIONES AUXILIARES
# ==========================================================

def cargar_configuracion():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f: return json.load(f)
        except: pass
    return {
        "origenes": "", "destinos": "", "fechas_ida": "", 
        "fechas_vuelta": "", "pasajeros": 2, "precio_maximo_pp": 200 
    }

config = cargar_configuracion()

def buscar_en_api(conf):
    if not conf.get("origenes") or not conf.get("destinos") or not conf.get("fechas_ida"):
        return {"error": True, "mensaje": "⚠️ Faltan datos en la configuración."}

    url = "https://serpapi.com/search.json"
    resultados = []
    
    origenes_lista = [o.strip().upper() for o in conf["origenes"].split(",") if o.strip()]
    destinos_lista = [d.strip().upper() for d in conf["destinos"].split(",") if d.strip()]
    fechas_ida = [f.strip() for f in conf["fechas_ida"].split(",") if f.strip()]
    fechas_vuelta = [f.strip() for f in conf["fechas_vuelta"].split(",")] if conf.get("fechas_vuelta") else []

    # Preparar lista de tareas para ejecución paralela
    tareas = []
    
    for origen in origenes_lista:
        for destino in destinos_lista:
            for idx, f_ida in enumerate(fechas_ida):
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
                
                tareas.append((origen, destino, f_ida, f_vuelta, params))

    def procesar_busqueda(tarea):
        origen, destino, f_ida, f_vuelta, params = tarea
        resultados_locales = []
        try:
            response = requests.get(url, params=params)
            data = response.json()
            if "error" in data: return []
            
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
                aerolinea = "Varias"
                logo = ""
                duracion_minutos = 0
                escalas = 0
                hora_salida = ""
                hora_llegada = ""

                if tramos:
                    aerolinea = tramos[0].get("airline", "Varias")
                    logo = tramos[0].get("airline_logo", "")
                    duracion_minutos = vuelo.get("total_duration", 0)
                    escalas = len(tramos) - 1
                    
                    try:
                        dep = tramos[0].get("departure_airport", {})
                        arr = tramos[-1].get("arrival_airport", {})
                        hora_salida = dep.get("time", "") or dep.get("departure_time", "")
                        hora_llegada = arr.get("time", "") or arr.get("arrival_time", "")
                    except: pass

                horas = duracion_minutos // 60
                minutos = duracion_minutos % 60
                duracion_fmt = f"{horas}h {minutos}m"
                
                query_vuelo = f"Vuelos desde {origen} a {destino} el {f_ida}"
                if f_vuelta: query_vuelo += f" y vuelta el {f_vuelta}"
                enlace_google = f"https://www.google.com/travel/flights?q={urllib.parse.quote(query_vuelo)}"
                
                resultados_locales.append({
                    "origen": origen, "destino": destino, "fecha_detectada": f_ida,
                    "fecha_vuelta": f_vuelta if f_vuelta else "",
                    "aerolinea": aerolinea, "logo_aerolinea": logo,
                    "duracion": duracion_fmt, "escalas": escalas,
                    "hora_salida": hora_salida, "hora_llegada": hora_llegada,
                    "precio_total": round(precio_total, 2),
                    "precio_pp": round(precio_pp, 2), 
                    "estado_precio": nivel_precio, "enlace": enlace_google
                })
        except Exception as e: print(f"Error procesando {origen}-{destino}: {e}")
        return resultados_locales

    # Ejecutar en paralelo (max 5 workers para no saturar)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futuros = [executor.submit(procesar_busqueda, tarea) for tarea in tareas]
        for futuro in concurrent.futures.as_completed(futuros):
            resultados.extend(futuro.result())
                    
    resultados_filtrados = [r for r in resultados if r["precio_pp"] <= float(conf["precio_maximo_pp"])]
    return sorted(resultados_filtrados, key=lambda x: x["precio_pp"])

def guardar_historial(vuelos, modo="Estándar"):
    if isinstance(vuelos, dict) and vuelos.get("error"): return
    historial = []
    if os.path.exists(HISTORIAL_FILE):
        try:
            with open(HISTORIAL_FILE, 'r') as f: historial = json.load(f)
        except: pass
        
    registro = {
        "id": datetime.datetime.now().strftime("%Y%m%d%H%M%S"),
        "fecha": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "modo": modo,
        "vuelos_encontrados": len(vuelos) if isinstance(vuelos, list) else 0,
        "mejores": vuelos[:10] if isinstance(vuelos, list) else [] 
    }
    
    historial.insert(0, registro)
    historial = historial[:50] 
    with open(HISTORIAL_FILE, 'w') as f: json.dump(historial, f, indent=4)

# ==========================================================
# LÓGICA DEL CRON INTELIGENTE (DOBLE TURNO)
# ==========================================================
def tarea_en_segundo_plano():
    print(f"[{datetime.datetime.now()}] ⏰ Ejecutando Batida Programada...")
    
    # 1. Validar configuración
    if not config.get("origenes") or not config.get("destinos"): 
        print("⚠️ Configuración incompleta. Abortando cron.")
        return

    # 2. Preparar listas limpias
    origenes_raw = [o.strip().upper() for o in config["origenes"].split(",") if o.strip()]
    destinos_raw = [d.strip().upper() for d in config["destinos"].split(",") if d.strip()]
    fechas_ida_raw = [f.strip() for f in config["fechas_ida"].split(",") if f.strip()]
    fechas_vuelta_raw = config.get("fechas_vuelta", "").split(",") 

    # Si no hay destinos o fechas, salimos
    if not destinos_raw or not fechas_ida_raw: return

    # 3. Matemática de Rotación (Modo Tarjetas)
    # Total de tarjetas = Mínimo común entre destinos y fechas (parejas)
    total_viajes = min(len(destinos_raw), len(fechas_ida_raw))
    total_combos = len(origenes_raw) * total_viajes
    
    dia_anio = datetime.datetime.now().timetuple().tm_yday
    
    # Índices para hoy (Doble turno)
    indices_hoy = [dia_anio % total_combos, (dia_anio + 1) % total_combos]
    
    url_tg = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    rutas_revisadas = []
    
    print(f"ℹ️ Hoy tocan los índices: {indices_hoy} de {total_combos} combinaciones.")

    # 4. EJECUCIÓN DEL DOBLE TURNO
    for idx in indices_hoy:
        # Calcular qué Origen y qué Tarjeta toca
        idx_origen = idx % len(origenes_raw)
        idx_viaje = (idx // len(origenes_raw)) % total_viajes
        
        origen_hoy = origenes_raw[idx_origen]
        destino_hoy = destinos_raw[idx_viaje]
        fecha_ida_hoy = fechas_ida_raw[idx_viaje]
        
        # Fecha vuelta (si existe para este índice)
        fecha_vuelta_hoy = ""
        if idx_viaje < len(fechas_vuelta_raw):
            fecha_vuelta_hoy = fechas_vuelta_raw[idx_viaje]

        rutas_revisadas.append(f"{origen_hoy} ➔ {destino_hoy}")
        
        # Configuración "Quirúrgica"
        config_smart = {
            "origenes": origen_hoy,
            "destinos": destino_hoy,
            "fechas_ida": fecha_ida_hoy,
            "fechas_vuelta": fecha_vuelta_hoy,
            "pasajeros": config["pasajeros"],
            "precio_maximo_pp": config["precio_maximo_pp"]
        }
        
        print(f"🔎 Buscando: {origen_hoy}-{destino_hoy} ({fecha_ida_hoy})...")
        
        # BUSCAR EN API
        vuelos = buscar_en_api(config_smart)
        guardar_historial(vuelos, f"Auto: {origen_hoy}-{destino_hoy}")
        
        # === CORRECCIÓN AQUÍ: ENVÍO A TELEGRAM ===
        if isinstance(vuelos, list) and len(vuelos) > 0:
            print(f"✅ ¡Vuelos encontrados! Enviando a Telegram...")
            
            mensaje = f"🚨 <b>¡CHOLLO DETECTADO!</b> 🚨\n"
            mensaje += f"✈️ <b>{origen_hoy} ➡️ {destino_hoy}</b>\n"
            
            # Cogemos solo los 3 primeros para no spamear
            for v in vuelos[:3]:
                # Extraemos datos con seguridad (.get por si acaso)
                fecha = v.get('fecha_detectada', 'Fecha N/A')
                precio = v.get('precio_pp', 0)
                estado = v.get('estado_precio', '')
                link = v.get('enlace', '#')
                
                mensaje += f"\n📅 <b>{fecha}</b>"
                mensaje += f"\n💰 <b>{precio}€</b> ({estado})"
                mensaje += f"\n🔗 <a href='{link}'>Ver vuelo</a>\n"
            
            # Enviar mensaje
            try:
                requests.post(url_tg, data={"chat_id": TELEGRAM_CHAT_ID, "text": mensaje, "parse_mode": "HTML"})
            except Exception as e:
                print(f"❌ Error enviando Telegram: {e}")
        else:
            print(f"📉 Sin vuelos baratos para esta ruta hoy.")

    # 5. REPORTE DE VIDA (Opcional, para saber que está vivo)
    # Solo lo enviamos si NO se encontraron chollos, para dar señales de vida
    mensaje_vida = f"🤖 <b>Reporte Diario Sabueso:</b>\n\n"
    mensaje_vida += f"He rastreado estas rutas hoy:\n"
    mensaje_vida += f"1️⃣ {rutas_revisadas[0]}\n"
    mensaje_vida += f"2️⃣ {rutas_revisadas[1]}\n\n"
    mensaje_vida += f"Ningún vuelo por debajo de {config['precio_maximo_pp']}€."
    
    # Descomenta la siguiente línea si quieres recibir este reporte diario aunque no haya ofertas
    requests.post(url_tg, data={"chat_id": TELEGRAM_CHAT_ID, "text": mensaje_vida, "parse_mode": "HTML"})
    
# ==========================================================
# RUTAS FLASK
# ==========================================================

@app.route('/')
def index(): return render_template('index.html', config=config)

@app.route('/api/guardar', methods=['POST'])
def guardar_config():
    global config
    config.update(request.json)
    with open(CONFIG_FILE, 'w') as f: json.dump(config, f, indent=4)
    return jsonify({"status": "success", "message": "✅ Configuración guardada."})

@app.route('/api/buscar', methods=['GET'])
def buscar_ahora():
    # Búsqueda Manual: Usa la configuración COMPLETA (sin rotación)
    vuelos = buscar_en_api(config)
    guardar_historial(vuelos, "Manual")
    return jsonify(vuelos)

@app.route('/api/explorar', methods=['GET'])
def explorar_ahora():
    if not config.get("origenes") or not config.get("fechas_ida"):
        return jsonify({"error": True, "mensaje": "⚠️ Configura Origen y Fecha Ida primero."})

    conf_exp = config.copy()
    conf_exp["destinos"] = DESTINOS_EXPLORADOR
    vuelos = buscar_en_api(conf_exp)
    guardar_historial(vuelos, "EXPLORADOR")
    
    if isinstance(vuelos, list) and len(vuelos) > 0:
        chollos = [v for v in vuelos if "🟢" in v.get('estado_precio', '')]
        if chollos:
            mensaje = "🌍 <b>RESUMEN MODO EXPLORADOR</b> 🌍\n\n"
            for v in chollos[:5]: 
                mensaje += f"📍 <b>{v['destino']}</b>: {v['precio_pp']}€ ({v['fecha_detectada']})\n"
                mensaje += f"🔗 <a href='{v['enlace']}'>Ver</a>\n"
            requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", data={"chat_id": TELEGRAM_CHAT_ID, "text": mensaje, "parse_mode": "HTML", "disable_web_page_preview": True})

    return jsonify(vuelos)

@app.route('/api/historial', methods=['GET'])
def ver_historial():
    if os.path.exists(HISTORIAL_FILE):
        with open(HISTORIAL_FILE, 'r') as f: return jsonify(json.load(f))
    return jsonify([])

@app.route('/api/borrar_historial', methods=['POST'])
def borrar_historial():
    if os.path.exists(HISTORIAL_FILE):
        os.remove(HISTORIAL_FILE)
    return jsonify({"status": "success", "message": "Historial eliminado."})

@app.route('/api/uso', methods=['GET'])
def obtener_uso_api():
    try:
        url = f"https://serpapi.com/account.json?api_key={SERPAPI_KEY}"
        res = requests.get(url)
        data = res.json()
        return jsonify({"usado": data.get("this_month_usage", 0), "limite": data.get("searches_per_month", 250), "error": False})
    except:
        return jsonify({"usado": "?", "limite": 250, "error": True})

@app.route('/api/cron_trigger', methods=['GET'])
def trigger_del_cron():
    if request.remote_addr != '127.0.0.1': return jsonify({"error": "Acceso denegado"}), 403
    tarea_en_segundo_plano()
    return jsonify({"status": "Batida inteligente ejecutada"})

@app.route('/historial')
def historial_page(): return render_template('historial.html')

# ==========================================================
# NUEVA RUTA: CALCULAR FUTURAS BATIDAS
# ==========================================================
@app.route('/api/proximas_batidas', methods=['GET'])
def get_proximas_batidas():
    # 1. Validar configuración
    if not config.get("origenes") or not config.get("destinos"):
        return jsonify([])

    origenes = [o.strip().upper() for o in config["origenes"].split(",") if o.strip()]
    destinos = [d.strip().upper() for d in config["destinos"].split(",") if d.strip()]
    fechas = [f.strip() for f in config["fechas_ida"].split(",") if f.strip()]
    
    # Si hay desajuste entre destinos y fechas, cortamos por lo sano
    min_len = min(len(destinos), len(fechas))
    if not origenes or min_len == 0: return jsonify([])

    # Total de "Tarjetas" (Viajes únicos configurados)
    total_viajes = min_len 
    total_combos = len(origenes) * total_viajes
    
    dia_actual = datetime.datetime.now().timetuple().tm_yday
    
    calendario = []
    
    # 2. Calcular HOY, MAÑANA y PASADO con la lógica de TARJETAS
    for offset in range(3):
        dia_simulado = dia_actual + offset
        
        # Doble turno
        indices = [(dia_simulado) % total_combos, (dia_simulado + 1) % total_combos]
        
        rutas_dia = []
        for idx in indices:
            idx_origen = idx % len(origenes)
            idx_viaje = (idx // len(origenes)) % total_viajes
            
            # Cogemos el destino y SU fecha correspondiente
            d = destinos[idx_viaje]
            f = fechas[idx_viaje]
            
            # Formato visual para la web
            rutas_dia.append(f"{origenes[idx_origen]} ➔ {d} ({f})")
            
        etiqueta = "HOY" if offset == 0 else ("MAÑANA" if offset == 1 else "PASADO")
        calendario.append({"dia": etiqueta, "rutas": rutas_dia})
        
    return jsonify(calendario)
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)