# CHRONA — High-Precision Global Time Engine

CHRONA is a high-precision, zero-latency global time application built with a modern luxury obsidian aesthetic. It provides instant bidirectional timezone conversion across 50,000+ world cities and IANA time zones, a live ticking World Observatory clock, and a high-precision time calculator.

Live Demo: **[https://digitalsuni-cloud.github.io/chrona/](https://digitalsuni-cloud.github.io/chrona/)**

---

## ✨ Features

- **⚡ 0ms Zero-Latency Instant Search**: Instant in-memory search across countries (e.g. Israel, United States, Japan), timezone abbreviations (IST, EST, PST, CET, GMT, JST), airports, and global cities. Non-blocking asynchronous enrichment with request cancellation (`AbortController`).
- **🌐 Real-Time Bidirectional Synchronization**: Edit time or date in any city column; all other timezone clocks update automatically.
- **🕒 Natural Language Time Parsing**: Supports standard clock formats as well as shorthand notation (`3p`, `1430`, `noon`, `midnight`, `now`).
- **☀️ Atmospheric Day/Night & Offsets**: Visual day/night indicators (`☀️ DAY` / `🌙 NIGHT`), relative day badges (`+1 day`, `-1 day`), and relative hour differences.
- **🌍 World Observatory (World Clock)**: Live ticking bento grid with real-time seconds, UTC offsets, and quick addition.
- **🧮 Precision Time Calculator**:
  - **Between**: Computes exact duration (days, hours, minutes, seconds) between two dates/times.
  - **After / Before**: Real-time addition or subtraction of years, months, days, hours, and minutes from any base date.
- **🎨 Obsidian Luxury Aesthetic**: Engineered with double-bezel card architecture (`Doppelrand`), subtle mesh gradient ambient glow, `JetBrains Mono` and `Plus Jakarta Sans` typography, and dark/light mode toggle.
- **📱 Fully Responsive**: Seamless experience across mobile, tablet, and ultra-wide displays.

---

## 🚀 Getting Started

CHRONA is pure vanilla web technology (zero build steps, zero external runtime dependencies).

To run locally:

```bash
# Clone the repository
git clone https://github.com/digitalsuni-cloud/chrona.git
cd chrona

# Serve with any static web server
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

---

## 📄 License

MIT License.
