# Stock App Backend

Minimal Express backend scaffold for stock-app.

## Run

```bash
npm start
```

## Environment

Set these in `.env`:

- `ALPHA_VANTAGE_KEY`
- `ALPHA_VANTAGE_URL` (optional)
- `POLYGON_KEY` (or `MASSIVE_KEY`)
- `POLYGON_URL` (optional)
- `TWELVE_DATA_KEY`
- `TWELVE_DATA_URL` (optional)

## Stock Data Endpoint

```bash
curl "http://localhost:3001/api/stocks?symbol=AAPL&startDate=2024-01-01&endDate=2024-02-01"
```

## Health Check

```bash
curl http://localhost:3001/health
```
