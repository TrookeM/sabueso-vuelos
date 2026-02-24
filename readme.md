# ✈️ Sabueso: Automated Flight Radar

![Sabueso Dashboard](./screenshot.jpg)

> **"Sabueso"** is a *self-hosted* tool designed to automate cheap flight searches, manage travel budgets, and send real-time opportunity alerts via Telegram.

## 🧐 The Problem

Finding cheap flights requires consistency and time. Deals appear and disappear within hours. I wanted a solution that:

1. Didn’t rely on my memory to search daily.
2. Notified me only when the actual price dropped below my per-person budget.
3. Could automatically explore multiple Nordic and European destinations.

## 🚀 Key Features

* **📡 Search Engine:** Integration with the Google Flights API (via SerpApi) to retrieve real-time data.
* **🧠 Smart Logic:** Filters results based on a maximum budget per passenger. If the flight is expensive, it ignores it; if it’s a bargain, you get notified.
* **🌍 Explorer Mode:** With a single click, performs a massive sweep across 13 preselected destinations (Oslo, Reykjavik, Prague, Vienna, etc.).
* **📊 Telemetry & Credits:** Built-in frontend calculator that estimates the cost per search to avoid exceeding the API’s free quota (250 requests/month).
* **🎨 Glassmorphism UI:** Modern dark-themed web interface built with Bootstrap 5 and Vanilla JS.
* **📱 Push Notifications:** Sends alerts with direct booking links to Telegram.
* **🕒 Automation:** Internal Linux Cron Job that runs automated searches every morning.

## 🛠️ Tech Stack

| Component | Technology |
| :--- | :--- |
| **Backend** | Python 3, Flask |
| **Frontend** | HTML5, JavaScript, Bootstrap 5 |
| **Database** | JSON (Flat-file for portability) |
| **Infrastructure** | Linux VPS (Ubuntu), Systemd |
| **CI/CD** | GitHub Actions |
| **APIs** | SerpApi, Telegram Bot API |

## ⚙️ Local Installation & Usage

1. **Clone the repository:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/sabueso-vuelos.git
    cd sabueso-vuelos
    ```

2. **Create virtual environment & install dependencies:**
    ```bash
    python -m venv venv
    source venv/bin/activate  # Or venv\Scripts\activate on Windows
    pip install -r requirements.txt
    ```

3. **Configure Environment Variables:**
    Rename the `.env.example` file to `.env` and add your keys:
    ```ini
    TELEGRAM_TOKEN=your_token
    TELEGRAM_CHAT_ID=your_id
    SERPAPI_KEY=your_api_key
    ```

4. **Run the application:**
    ```bash
    python app.py
    ```
    Open `http://localhost:5000` in your browser.

## 🔄 CI/CD & Deployment Workflow

The project includes a **GitHub Actions** pipeline configured for continuous deployment:

1. On every **push** to the `main` branch, GitHub connects to the VPS via SSH.
2. Executes a `git pull` to fetch the latest changes.
3. Intelligently manages local configuration files (`config.json`, `historial.json`) to avoid conflicts.
4. Automatically restarts the `systemd` service.

This allows rapid iteration and improvement without manually accessing the server console.

## 📝 Project Structure

```text
/sabueso-vuelos
├── .github/workflows/   # CI/CD pipeline
├── static/              # Assets (CSS, JS, Images)
├── templates/           # HTML Views (Jinja2)
├── app.py               # Flask server & core logic
├── config.json          # (Auto-generated) Configuration persistence
├── historial.json       # (Auto-generated) Search history database
└── requirements.txt     # Python dependencies
```

### 3️⃣ Small Final Detail (requirements.txt)

Just in case it’s not up to date, run this command before pushing everything to ensure `requirements.txt` matches exactly what your project uses:

```bash
pip freeze > requirements.txt
```

Built with ❤️ and lots of coffee as a personal learning project.
