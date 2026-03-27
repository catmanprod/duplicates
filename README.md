# Product Dedupe (Web Version)

Односторінковий веб-інструмент для пошуку дублікатів товарів у CSV/XLSX.

## Можливості
- Exact match: `Вендор код`, `Штрихкод`
- Match коду в назві: `vendor_code_in_title`, `barcode_in_title`
- Опційний fuzzy по назві (тільки коли vendor + barcode порожні)
- Експорт результату в CSV

## Локальний запуск
Відкрийте `index.html` у браузері або запустіть простий сервер:

```bash
python -m http.server 8000
```

Потім відкрийте `http://localhost:8000`.

## Деплой на GitHub Pages
Для user-site:
1. Назва репозиторію: `opfeatures.github.io`
2. Покладіть ці файли в `main`
3. Пуш у GitHub — сайт з'явиться на `https://opfeatures.github.io/`
