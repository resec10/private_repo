# CICS Task 1 — Estrazione clienti con crediti in corso

Implementazione del task descritto in `Task__CICS_1_1.docx`.

## Moduli prodotti

| Tipo | Nome       | File                     | Descrizione                                   |
|------|------------|--------------------------|-----------------------------------------------|
| CPX  | `XX0A7344` | `copy/XX0A7344.cpy`      | Copy commarea del servizio                     |
| PGM  | `XX0AW344` | `XX0AW344.cbl`           | Programma CICS di estrazione                    |
| WNF  | `CR0AF344` | —                        | Descrittore web-node-function (vedi nota sotto) |

## Cosa fa il programma

Estrae la lista dei clienti che hanno crediti in corso, con possibilità di
filtrare per:

- **Natura giuridica** (`XXA344-I-NCG`)
- **Data apertura credito** (`XXA344-I-DT-INIZIO`, confrontata con `DTISTR`)
- **Range di importo** (`XXA344-I-IMPORTO-DA` / `XXA344-I-IMPORTO-A`)

Regole implementate:

- **Almeno un filtro** deve essere attivo, altrimenti viene restituito il
  messaggio `Nessun filtro attivo` (`RC='01'`, `RESP='001'`).
- Vengono restituiti **al massimo 30 record**; se ne esistono altri viene
  restituito il messaggio `Ci sono i clienti da mostrare.`.
- **Entrambi i limiti dell'importo** devono essere valorizzati: se un valore
  non è numerico o è uguale a zero, il limite `DA` viene forzato al minimo
  (`0`) e il limite `A` al massimo (`999999999999,999`), coerentemente con
  l'esempio `OUTPUT.txt`.
- In caso di esito regolare `XXA344-MSG` riporta la diagnostica
  `DIAG FETCH=nnnnn KEPT=nn` (righe lette dal cursore / righe restituite),
  come nell'esempio `OUTPUT.txt`.

## Struttura del programma (`XX0AW344.cbl`)

La PROCEDURE DIVISION è organizzata in SECTION:

| SECTION          | Contenuto                                                        |
|-------------------|-------------------------------------------------------------------|
| `INIZIO`          | Mainline, inizializzazione campi output, controlli formali, verifica filtri, normalizzazione importo |
| `ELABORA`         | Ciclo di fetch sul cursore FGTS22 e applicazione dei filtri (data, importo, NCG) |
| `VALORIZZA-OUTPUT` | Popolamento della riga di output e conversione del campo Stato   |
| `CALL-FGTSQA02`    | `EXEC CICS LINK` verso `FGTSQA02` (interfaccia DB2, funzione FGTS22) |
| `CALL-AN00C126`    | `EXEC CICS LINK` verso `AN00C126` (lettura tabella 1 anagrafe)   |
| `FINE`             | Gestione errori (formali/SQL) e uscita programma (`GOBACK`)      |

## Routine richiamate

- **`FGTSQA02`** (copy `FG000A02`) — funzione **`FGTS22`**: cursore che
  restituisce i crediti. In input vengono valorizzati `W-FGTQ22-FG02-CDISTI`
  e `W-FGTQ22-FG02-STATO`; in output si utilizzano `NDG`, `DTISTR`,
  `PRGISTR`, `STATO`, `STATOAV`, `IMPORTO`.
- **`AN00C126`** (copy `AN000088`) — funzione **`N `**: legge la tabella 1
  anagrafe per `IST + NDG`; il tracciato restituito (`AN0088-DATI`) viene
  mascherato con la copy `AN000750` per leggere il campo `A1-NATGIU` usato
  dal filtro sulla natura giuridica.

## Conversione del campo Stato

Il campo Stato in tabella è alfanumerico di lunghezza 1 e viene convertito
nella descrizione restituita in `XXA344-O-STATO`:

| Codice | STATOAV | Descrizione     |
|--------|---------|-----------------|
| `L`    |         | In lavorazione  |
| `A`    |         | Annullato       |
| `C`    | `DEL`   | Deliberato      |
| `P`    |         | Prenotazione    |

## Dipendenze (copy esistenti in COPYLIB)

Il programma richiama in `COPY` i tracciati già presenti nella libreria del
sito: `FG000A02`, `AN000088`, `AN000750`. Non sono ridistribuiti in questo
repository perché appartengono all'infrastruttura esistente.

## Nota sul modulo WNF (`CR0AF344`)

Il descrittore WNF è un artefatto di configurazione del layer di web service
(l'envelope `WB000-*` visibile in `OUTPUT.txt`) generato dagli strumenti del
sito. Non essendo stato fornito un template/esempio del suo formato, non è
stato generato qui per evitare di produrre un descrittore non conforme; il
programma e la copy commarea sono comunque completi e pronti per essere
esposti tramite tale descrittore.

## Assunzione rilevante

L'esempio `OUTPUT.txt` mostra una chiamata eseguita senza filtri realmente
valorizzati (importo forzato ai default). La regola testuale del task
("almeno un filtro deve essere attivo") è stata considerata autoritativa e
quindi implementata: la verifica dei filtri usa i valori di importo
**originali** (prima della normalizzazione), così un importo non valorizzato
non conta come filtro attivo.
