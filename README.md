# Fanta Mundial 2026 - Dashboard live livello 3

Questa versione è pensata per essere pubblicata su GitHub Pages e aggiornata automaticamente ogni ora tramite GitHub Actions.

## Come pubblicarla
1. Crea un account su GitHub.
2. Crea un repository nuovo, per esempio `fanta-mundial-2026`.
3. Carica tutti i file e le cartelle contenuti in questo pacchetto.
4. Vai in **Settings > Secrets and variables > Actions > New repository secret**.
5. Crea il secret `FOOTBALL_DATA_TOKEN` con il token gratuito di football-data.org.
6. Vai in **Settings > Pages** e scegli `Deploy from branch`, branch `main`, cartella `/root`.
7. Apri la pagina pubblicata e condividi il link nel gruppo WhatsApp.

## Aggiornamento automatico
Il workflow `.github/workflows/update-results.yml` gira ogni ora e lancia:

```bash
npm run update
```

Lo script legge i risultati da football-data.org, aggiorna `data/results.json` e ricalcola la classifica.

## Note importanti
- Le rose dei partecipanti sono state ricostruite dalle foto: controllale in `data/config.json`.
- Se un nome squadra dell'API è diverso dal nome usato nel gioco, aggiungi l'equivalenza in `aliases` dentro `data/config.json`.
- Bonus knockout e casi particolari possono essere rifiniti quando saranno disponibili calendario e fasi ufficiali complete.
