# 🍺 Alko Radar - Żul Mapa

**Aplikacja hackathonowa** - "zróbcie aplikację która nas rozśmieszy"

## 🎯 Koncepcja

Aplikacja ostrzegająca przed potencjalnie "niebezpiecznymi" miejscami alkoholowymi:

- 🍷 Sklepy monopolowe
- 🎵 Kluby nocne
- 🍺 Puby i bary
- 🚨 Miejsca interwencji policyjnych
- ⚠️ User-generated zgłoszenia

## 🚀 Jak uruchomić

```powershell
cd frontend
npm install
npm run dev
```

Aplikacja dostępna na:

- Lokalnie: `http://localhost:5173`
- W sieci: `http://10.10.236.43:5173` (lub inny Network URL)

## 📱 Użycie na telefonie

1. Upewnij się że komputer i telefon są w tej samej sieci WiFi
2. Otwórz na telefonie adres Network URL (np. `http://10.10.236.43:5173`)
3. Kliknij przycisk lokalizacji 📍 (pozwól przeglądarce na dostęp)
4. Kliknij "Załaduj dane" 📡 aby pobrać rzeczywiste sklepy z OpenStreetMap

## 🛠️ Co zostało zrobione

### ✅ Główne komponenty

1. **Map.svelte** - Główna mapa z Leaflet/OpenStreetMap
   - Reaktywna geolokalizacja użytkownika
   - Automatyczne centrowanie na lokalizacji
   - Markery z poziomem zagrożenia (1-10)
   - Pulsujące animacje markerów

2. **Header.svelte** - Nagłówek z logo "Alko Radar"
   - Gradient i animacje
   - Menu button (placeholder)

3. **Legend.svelte** - Rozkładana legenda
   - Wyjaśnienie ikon
   - Skala niebezpieczeństwa
   - Ukrywanie/pokazywanie

4. **LocationButton.svelte** - Przycisk geolokalizacji
   - Start/stop trackingu
   - Wizualizacja błędów
   - Pulsująca animacja gdy aktywny

5. **LoadDataButton.svelte** - Pobieranie rzeczywistych danych
   - Integracja z Overpass API (OpenStreetMap)
   - Pobiera sklepy/puby/kluby w promieniu 2km

6. **FloatingButton.svelte** - Przycisk dodawania miejsc
   - Placeholder na zgłoszenia user-generated

### 📦 Stores (Svelte 5 Runes)

1. **location.svelte.ts** - Store lokalizacji
   - `startTracking()` - włącz śledzenie
   - `stopTracking()` - wyłącz śledzenie
   - Reactive `userLocation`, `isTracking`, `error`

2. **poi.svelte.ts** - Store punktów POI
   - `addPOI()` - dodaj punkt
   - `removePOI()` - usuń punkt
   - `findNearby()` - znajdź w promieniu
   - `calculateDistance()` - oblicz odległość
   - `loadDemoData()` - załaduj demo dane

### 🌍 Integracja z OpenStreetMap

**overpass.ts** - Helper do pobierania danych z OSM

- `fetchPOIsNearby(lat, lng, radiusKm)` - pobiera POI w promieniu
- Automatyczne mapowanie tagów OSM:
  - `shop=alcohol` → sklepy monopolowe
  - `amenity=pub` → puby
  - `amenity=bar` → bary
  - `amenity=nightclub` → kluby nocne

### 🎨 Design

- Ciemny gradient header (1a1a2e → 16213e)
- Czerwone/pomarańczowe markery zagrożenia
- Animacje bounce/pulse/swing
- Responsywny - działa na mobile
- Material-inspired shadows i rounded corners

## 🔜 Następne kroki

1. **Integracja z backendem** (Express/MongoDB już jest w głównym folderze)
2. **User authentication** - zgłoszenia od zalogowanych userów
3. **Dodawanie własnych miejsc** - formularz zgłoszeniowy
4. **System weryfikacji** - upvote/downvote dla miejsc
5. **Powiadomienia** - "Uwaga! Zbliżasz się do strefy wysokiego ryzyka!"
6. **Heat mapa** - wizualizacja gęstości niebezpieczeństw
7. **Filtrowanie** - po typie, po poziomie zagrożenia
8. **Routing** - "Zaplanuj bezpieczną trasę"
9. **Statystyki** - najbardziej niebezpieczne dzielnice

## 📝 Notatki techniczne

### Geolokalizacja na mobile

- **HTTPS może być wymagane** przez niektóre przeglądarki
- Alternatywa: użyj ngrok/cloudflare tunnel
- Lub testuj w Chrome z `chrome://flags/#unsafely-treat-insecure-origin-as-secure`

### Overpass API

- Rate limit: ~10k requestów/dzień
- Timeout: 25 sekund
- Można użyć cache'owania dla optymalizacji

### Svelte 5 Runes

- `$state` zamiast reactive declarations
- `$props()` zamiast `export let`
- `$effect()` zamiast `$:` w logice reaktywnej
- `onclick` zamiast `on:click`

## 🎉 Demo

Aplikacja ma:

- ✅ Działającą mapę
- ✅ Geolokalizację użytkownika
- ✅ Integrację z OpenStreetMap
- ✅ Reaktywne stores
- ✅ Humorystyczny design
- ✅ Mobile-friendly UI

**Gotowe do dalszej pracy na hackathonie!** 🚀
