# 🚀 Colab to GitHub (DSV_Colab) - Chrome Extension

Ek powerful aur user-friendly Chrome Extension (Manifest V3) jo aapke **Google Colab notebooks (`.ipynb`)** ko direct **1-Click** me aapki GitHub repository **`DSV_Colab`** me push kar deta hai!

Agar aapke GitHub account me `DSV_Colab` repository pehle se nahi bani hui hai, toh extension automatically us repo ko create karega aur notebook push kar dega. Agar pehle se bani hui hai, toh existing repo me file add ya update kar dega!

---

## ✨ Features

- ⚡ **1-Click Push:** Colab kholkar direct "Push" button par click karo aur notebook GitHub par commit ho jayegi.
- 🎯 **In-Page Floating Button:** Google Colab ke andar bottom-right me direct `Push DSV_Colab` button inject hota hai (popup kholne ki bhi zaroorat nahi!).
- 📦 **Auto-Repo Creation:** Agar aapke account me `DSV_Colab` repository nahi hai, toh ye automatically public/private repository create karta hai with `main` branch.
- 🔄 **Smart File Updates:** Agar file pehle se repository me maujood hai, toh uski `SHA` fetch karke clean update commit banata hai.
- 🛡️ **Zero Corrupt Data:** Colab ke native download pipeline ko intercept karke exact complete Jupyter Notebook JSON nikalta hai, sath hi Google Drive aur DOM fallback bhi shamil hai.
- 🎨 **Modern Eye-friendly UI:** Sleek dark popup interface with progress stepper, verification system, aur direct GitHub commit/file links.

---

## 🛠️ Installation Guide (Kaise Install Karein)

1. **Repository Download / Clone Karein:**
   ```bash
   git clone https://github.com/abhiyank-mishra/colab-to-github-extension.git
   ```
   *(Ya fir ZIP download karke extract kar lein)*

2. **Chrome Browser Kholein:**
   URL bar me type karein:
   ```text
   chrome://extensions/
   ```
   aur `Enter` dabayein.

3. **Developer Mode On Karein:**
   Top-right corner me **"Developer mode"** toggle switch hoga, use **ON** kar dein.

4. **Extension Load Karein:**
   Top-left me **"Load unpacked"** button par click karein aur downloaded `colab-to-github-extension` folder select karein:
   ```text
   colab-to-github-extension
   ```
   Extension Chrome me successfully load ho jayegi!

---

## 🔑 GitHub Token Setup (Sirf 1 Baar Karna Hai)

Extension ko GitHub par repo check/create aur push karne ke liye Personal Access Token (PAT) chahiye:

1. **GitHub Token Page par jayein:**
   - [github.com/settings/tokens/new](https://github.com/settings/tokens/new?scopes=repo&description=Colab+to+GitHub+DSV_Colab) par jayein.
   - Note me likhein: `Colab to GitHub`
   - Scopes me **`repo`** (Full control of private repositories) checkbox ko tick karein.
   - Niche **"Generate token"** par click karein.
   - Token copy kar lein (e.g. `ghp_xxxxxxxxxxxx`).

2. **Extension Settings me Token Save Karein:**
   - Chrome toolbar me extension icon par click karein.
   - Top right me **Settings** tab par click karein.
   - Apna GitHub Token paste karein.
   - Target Repository me `DSV_Colab` already set hai.
   - **"Verify Token"** dabayein (aapka GitHub username verify ho jayega).
   - **"Save Settings"** par click karein!

---

## 🚀 How to Use (Kaise Use Karein)

### Option 1: Direct Colab ke andar Floating Button se (Sabse Fast!)
1. Apna koi bhi Google Colab notebook kholein (`https://colab.research.google.com/...`).
2. Bottom-right corner me aapko ek sleek compact button dikhega: **`Push`** (new notebook ke liye) ya **`Update`** (agar notebook pehle se `DSV_Colab` me exist karti hai).
3. Bas us button par click karein!
4. Real-time **3-Stage Live Animation** chalegi (`Reading...` -> 🚀 `Pushing...` -> ✅ `Pushed!`), aur notebook direct GitHub par commit ho jayegi.
5. Success toast notification aayega with **"View on GitHub ↗"** direct link!

### Option 2: Extension Popup se
1. Google Colab tab par rehte hue Chrome toolbar me extension icon par click karein.
2. File name aur commit message verify karein (auto-filled rehta hai).
3. **"🚀 Push to DSV_Colab"** button par click karein.
4. Real-time progress bar dikhega:
   - 📥 Step 1: Extracting Colab notebook (.ipynb)
   - 📦 Step 2: Checking / Creating repository `DSV_Colab`
   - 🚀 Step 3: Committing & pushing to GitHub
5. Push complete hone par direct GitHub URL mil jayegi!

---

## 📂 Project Structure

```
colab-to-github-extension/
├── manifest.json            # Manifest V3 Extension Config
├── background.js            # Background service worker (API dispatching)
├── icons/                   # High-res extension icons (16, 48, 128 px)
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── content/
│   ├── content.js           # Isolated world script (Floating button + UI toast)
│   ├── content-main.js      # Main world script (Colab serialization extractor)
│   └── content.css          # Floating button & toast design
├── popup/
│   ├── popup.html           # Modern popup interface
│   ├── popup.css            # Dark mode styling
│   └── popup.js             # Tab detection, stepper & GitHub API triggers
├── utils/
│   └── github.js            # GitHub REST API client (get/create repo & commit file)
└── README.md                # Documentation & instructions
```
