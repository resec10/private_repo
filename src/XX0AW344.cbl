      *#PGM CICS:
      *#ESTRAZIONE LISTA CLIENTI CON CREDITI IN CORSO
      *****************************************************************
       IDENTIFICATION DIVISION.
      *****************************************************************
      *=====================*
       PROGRAM-ID. XX0AW344.
      *=====================*
      *---------------------------------------------------------------*
      *#VAR 260720 CRME344                                             *
      *#IMPLEMENTAZIONE PROGRAMMA                                      *
      *---------------------------------------------------------------*
      *                                                               *
      *  Il programma estrae la lista dei clienti che hanno crediti   *
      *  in corso. La lista puo' essere filtrata per:                 *
      *      - natura giuridica  (XXA344-I-NCG)                        *
      *      - data apertura credito (XXA344-I-DT-INIZIO)              *
      *      - range di importo (XXA344-I-IMPORTO-DA / -A)            *
      *                                                               *
      *  Regole:                                                       *
      *  - almeno un filtro deve essere attivo, altrimenti viene      *
      *    restituito il messaggio 'Nessun filtro attivo';            *
      *  - vengono restituiti al massimo 30 record; se ne esistono    *
      *    altri viene restituito il messaggio                        *
      *    'Ci sono i clienti da mostrare.';                          *
      *  - entrambi i limiti dell'importo devono essere valorizzati:  *
      *    se un valore non e' numerico o e' uguale a zero, il DA     *
      *    viene forzato al minimo (0) e l'A al massimo               *
      *    (999999999999,999).                                        *
      *                                                               *
      *  La lista viene letta con la routine FGTSQA02 (copy FG000A02) *
      *  funzione FGTS22.                                             *
      *  La natura giuridica del cliente viene letta con la routine   *
      *  AN00C126 (copy AN000088), campo A1-NATGIU della copy         *
      *  AN000750.                                                    *
      *                                                               *
      *  Commarea utilizzata: XX0A7344.                               *
      *                                                               *
      *  In OUTPUT:                                                    *
      *  XXA344-RC   - '00' Elaborazione conclusa correttamente       *
      *                '01' Errore formale / nessun filtro attivo     *
      *                '99' Errore SQL                                *
      *  XXA344-RESP - progressivo di errore                          *
      *  XXA344-MSG  - campo messaggi                                 *
      *****************************************************************
      *****************************************************************
       ENVIRONMENT DIVISION.
      *****************************************************************
      *===============================================================*
       CONFIGURATION SECTION.
      *===============================================================*
       SPECIAL-NAMES.
            DECIMAL-POINT  IS  COMMA.

      *****************************************************************
       DATA DIVISION.
      *****************************************************************
      *---------------------------------------------------------------*
       WORKING-STORAGE SECTION.
      *---------------------------------------------------------------*
       01  FILLER  PIC  X(30)  VALUE  '*** VARIABILI DI COMODO ----->'.
      *---------------------------------------------------------------*
       01  WS-FLAGS.
           05 WS-FINE-CURSORE            PIC X(01) VALUE 'N'.
              88 FINE-CURSORE                      VALUE 'S'.
           05 WS-TROPPI-DATI             PIC X(01) VALUE 'N'.
              88 TROPPI-DATI                       VALUE 'S'.
           05 WS-FILTRO-ATTIVO           PIC X(01) VALUE 'N'.
              88 FILTRO-ATTIVO                     VALUE 'S'.
           05 WS-REC-VALIDO              PIC X(01) VALUE 'N'.
              88 REC-VALIDO                        VALUE 'S'.
      *
       01  WS-CONTATORI.
           05 WS-NUM-FETCH               PIC 9(05) VALUE ZEROES.
           05 WS-NUM-KEPT                PIC 9(02) VALUE ZEROES.
           05 WS-IDX                     PIC 9(02) VALUE ZEROES.
      *
       01  WS-COSTANTI.
           05 WS-MAX-EL                  PIC 9(02) VALUE 30.
           05 WS-IMP-MIN                 PIC S9(12)V9(03) VALUE ZEROES.
           05 WS-IMP-MAX                 PIC S9(12)V9(03)
                                         VALUE +999999999999,999.
      *---------------------------------------------------------------*
       01  FILLER  PIC  X(30)  VALUE  '*** MESSAGGI DIAGNOSTICI ---->'.
      *---------------------------------------------------------------*
       01  WS-MSG-DIAG.
           05 FILLER                     PIC X(11) VALUE 'DIAG FETCH='.
           05 WS-DIAG-FETCH              PIC 9(05) VALUE ZEROES.
           05 FILLER                     PIC X(06) VALUE ' KEPT='.
           05 WS-DIAG-KEPT               PIC 9(02) VALUE ZEROES.
      *---------------------------------------------------------------*
       01  FILLER  PIC  X(30)  VALUE  '*** MESSAGGI DI ERRORE ------>'.
      *---------------------------------------------------------------*
       01  WS-ERRORE-SQL.
           05  FILLER                    PIC X(023) VALUE
               ' Programma: XX0AW344 - '.
           05  FILLER                    PIC X(026) VALUE
               'Errore SQL - Interfaccia: '.
           05  WS-INT-SQL                PIC X(008).
           05  FILLER                    PIC X(013) VALUE
               ' -  sqlcode: '.
           05  WS-CODE-ERR-SQL           PIC  +ZZZ9.
      *---------------------------------------------------------------*
       01  FILLER  PIC  X(30)  VALUE  '*INTERF. TAB. FG00TB02 ------>'.
      *---------------------------------------------------------------*
      *TABELLA FG00TB02 - INTERFACCIA FGTSQA02
       01  FG02-LEN                      PIC S9(4) COMP VALUE +4096.
       01  FG02-REC.
           COPY FG000A02.
      *---------------------------------------------------------------*
       01  FILLER  PIC  X(30)  VALUE  '*COMMAREA ROUTINE AN00C126 -->'.
      *---------------------------------------------------------------*
      *COMMAREA ROUTINE ANAGRAFE (L=2000)
       01  AN0088-LEN                    PIC S9(4) COMP VALUE +2000.
           COPY AN000088.
      *---------------------------------------------------------------*
       01  FILLER  PIC  X(30)  VALUE  '*TRACCIATO TABELLA 1 AN ----->'.
      *---------------------------------------------------------------*
      *MASCHERA CAMPO AN0088-DATI PER FUNZIONE 'N '
           COPY AN000750.
      *
      *===============================================================*
       LINKAGE SECTION.
      *===============================================================*
       01  DFHCOMMAREA.
           COPY XX0A7344 REPLACING ==01 XX0A7344.== BY ====.

      *---------------------------------------------------------------*
       PROCEDURE DIVISION.
      *---------------------------------------------------------------*
      *=================================================================*
       INIZIO SECTION.
      *=================================================================*
       INIZIO-PROGRAMMA.
      *---------------------------------------------------------------*
      *    Mainline: inizializzazione, controlli, elaborazione, fine.

           PERFORM L0001-DATI-INIZIALI   THRU L0001-DATI-INIZIALI-EX.

           PERFORM L0009-CONTROLLO-BASE  THRU L0009-CONTROLLO-BASE-EX.

           PERFORM L0100-ELABORA         THRU L0100-ELABORA-EX.

           PERFORM L9999-USCITA-PGM      THRU L9999-USCITA-PGM-EX.

       INIZIO-PROGRAMMA-EX.
           EXIT.
      *---------------------------------------------------------------*
       L0001-DATI-INIZIALI.
      *---------------------------------------------------------------*
      *    Inizializzazione campi di output.

           MOVE '00'                     TO XXA344-RC.
           MOVE '000'                    TO XXA344-RESP.
           MOVE ZEROES                   TO XXA344-SQLCODE.
           MOVE SPACES                   TO XXA344-MSG.
           MOVE SPACES                   TO XXA344-PGMERR.

           INITIALIZE                    XXA344-OUTPUT.

           MOVE ZEROES  TO WS-NUM-FETCH WS-NUM-KEPT WS-IDX.
           MOVE 'N'     TO WS-FINE-CURSORE
                           WS-TROPPI-DATI
                           WS-FILTRO-ATTIVO.

       L0001-DATI-INIZIALI-EX.
           EXIT.
      *---------------------------------------------------------------*
       L0009-CONTROLLO-BASE.
      *---------------------------------------------------------------*
      *    Controllo formale dei dati in commarea.

      *    Codice istituto obbligatorio e numerico.
           IF  XXA344-I-CDISTI NOT NUMERIC
               MOVE 'Commarea errata: CDISTI' TO XXA344-MSG
               MOVE '003'                     TO XXA344-RESP
               PERFORM L9996-ERRORE           THRU L9996-ERRORE-EX
           END-IF.

      *    Verifica presenza di almeno un filtro (importo originale).
           PERFORM L0020-VERIFICA-FILTRI  THRU L0020-VERIFICA-FILTRI-EX.

           IF  NOT FILTRO-ATTIVO
               MOVE 'Nessun filtro attivo'    TO XXA344-MSG
               MOVE '001'                     TO XXA344-RESP
               PERFORM L9996-ERRORE           THRU L9996-ERRORE-EX
           END-IF.

      *    Normalizzazione limiti importo.
           PERFORM L0010-NORMALIZZA-IMP   THRU L0010-NORMALIZZA-IMP-EX.

       L0009-CONTROLLO-BASE-EX.
           EXIT.
      *---------------------------------------------------------------*
       L0010-NORMALIZZA-IMP.
      *---------------------------------------------------------------*
      *    Entrambi i limiti devono essere valorizzati: se un valore
      *    non e' numerico o e' zero si forza il minimo/massimo.

           IF  XXA344-I-IMPORTO-DA NOT NUMERIC
           OR  XXA344-I-IMPORTO-DA = ZERO
               MOVE WS-IMP-MIN            TO XXA344-I-IMPORTO-DA
           END-IF.

           IF  XXA344-I-IMPORTO-A NOT NUMERIC
           OR  XXA344-I-IMPORTO-A = ZERO
               MOVE WS-IMP-MAX           TO XXA344-I-IMPORTO-A
           END-IF.

       L0010-NORMALIZZA-IMP-EX.
           EXIT.
      *---------------------------------------------------------------*
       L0020-VERIFICA-FILTRI.
      *---------------------------------------------------------------*
      *    Determina se almeno un filtro e' valorizzato dall'utente.

           IF  XXA344-I-NCG NOT = SPACES
           AND XXA344-I-NCG NOT = LOW-VALUES
               SET FILTRO-ATTIVO         TO TRUE
           END-IF.

           IF  XXA344-I-DT-INIZIO NUMERIC
           AND XXA344-I-DT-INIZIO NOT = ZERO
               SET FILTRO-ATTIVO         TO TRUE
           END-IF.

           IF  XXA344-I-IMPORTO-DA NUMERIC
           AND XXA344-I-IMPORTO-DA NOT = ZERO
               SET FILTRO-ATTIVO         TO TRUE
           END-IF.

           IF  XXA344-I-IMPORTO-A NUMERIC
           AND XXA344-I-IMPORTO-A NOT = ZERO
               SET FILTRO-ATTIVO         TO TRUE
           END-IF.

       L0020-VERIFICA-FILTRI-EX.
           EXIT.
      *=================================================================*
       ELABORA SECTION.
      *=================================================================*
       L0100-ELABORA.
      *---------------------------------------------------------------*
      *    Lettura ciclica del cursore FGTS22 e valorizzazione della
      *    tabella di output applicando i filtri richiesti.

           MOVE ZEROES                   TO N-SQL-CODE.
           MOVE SPACES                   TO F-OPEN-22.
           MOVE 'FGTS22'                 TO C-SQL-FUNZ.

           MOVE XXA344-I-CDISTI          TO W-FGTQ22-FG02-CDISTI.
           MOVE XXA344-I-STATO           TO W-FGTQ22-FG02-STATO.

           PERFORM UNTIL FINE-CURSORE OR TROPPI-DATI

              PERFORM INTERF-FGTS22   THRU INTERF-FGTS22-EX

              EVALUATE TRUE
                 WHEN N-SQL-CODE = +100
                      SET FINE-CURSORE   TO TRUE
                 WHEN N-SQL-CODE NOT = ZERO
                      MOVE N-SQL-CODE    TO WS-CODE-ERR-SQL
                                            XXA344-SQLCODE
                      MOVE 'FGTSQA02'    TO WS-INT-SQL
                      PERFORM L9998-ERRORE-SQL
                                      THRU L9998-ERRORE-SQL-EX
                 WHEN OTHER
                      ADD 1              TO WS-NUM-FETCH
                      PERFORM L0200-FILTRA-RECORD
                                      THRU L0200-FILTRA-RECORD-EX
              END-EVALUATE

           END-PERFORM.

           MOVE WS-NUM-FETCH             TO WS-DIAG-FETCH.
           MOVE WS-NUM-KEPT              TO WS-DIAG-KEPT.

           IF  TROPPI-DATI
               MOVE 'Ci sono i clienti da mostrare.' TO XXA344-MSG
           ELSE
               MOVE WS-MSG-DIAG          TO XXA344-MSG
           END-IF.

       L0100-ELABORA-EX.
           EXIT.
      *---------------------------------------------------------------*
       L0200-FILTRA-RECORD.
      *---------------------------------------------------------------*
      *    Applica i filtri attivi al record letto dal cursore.

           SET REC-VALIDO                TO TRUE.

      *    Filtro data apertura credito: DT-INIZIO vs DTISTR.
           IF  XXA344-I-DT-INIZIO NUMERIC
           AND XXA344-I-DT-INIZIO NOT = ZERO
               IF I-FGTQ22-FG02-DTISTR < XXA344-I-DT-INIZIO
                  MOVE 'N'               TO WS-REC-VALIDO
               END-IF
           END-IF.

      *    Filtro range importo.
           IF  REC-VALIDO
               IF  I-FGTQ22-FG02-IMPORTO < XXA344-I-IMPORTO-DA
               OR  I-FGTQ22-FG02-IMPORTO > XXA344-I-IMPORTO-A
                   MOVE 'N'              TO WS-REC-VALIDO
               END-IF
           END-IF.

      *    Filtro natura giuridica (NCG) tramite routine AN00C126.
           IF  REC-VALIDO
           AND XXA344-I-NCG NOT = SPACES
           AND XXA344-I-NCG NOT = LOW-VALUES
               PERFORM L0300-LEGGI-NATGIU
                                      THRU L0300-LEGGI-NATGIU-EX
               IF A1-NATGIU NOT = XXA344-I-NCG
                  MOVE 'N'               TO WS-REC-VALIDO
               END-IF
           END-IF.

      *    Se il record e' valido lo memorizzo (max 30).
           IF  REC-VALIDO
               IF  WS-IDX < WS-MAX-EL
                   ADD 1                 TO WS-IDX
                   ADD 1                 TO WS-NUM-KEPT
                   PERFORM L0250-VALORIZZA-OUT
                                      THRU L0250-VALORIZZA-OUT-EX
               ELSE
                   SET TROPPI-DATI       TO TRUE
               END-IF
           END-IF.

       L0200-FILTRA-RECORD-EX.
           EXIT.
      *---------------------------------------------------------------*
       L0300-LEGGI-NATGIU.
      *---------------------------------------------------------------*
      *    Legge la tabella 1 AN tramite la routine AN00C126 per
      *    ricavare la natura giuridica del cliente (A1-NATGIU).

           MOVE SPACES                   TO A1-RECORD.

           MOVE 'N '                     TO AN0088-FUNZ.
           MOVE XXA344-I-CDISTI          TO AN0088-CDISTI.
           MOVE I-FGTQ22-FG02-NDG        TO AN0088-NDG.

           PERFORM INTERF-AN126          THRU INTERF-AN126-EX.

           IF  AN0088-RC = '00'
               MOVE AN0088-DATI          TO A1-RECORD
           ELSE
               MOVE SPACES               TO A1-NATGIU
           END-IF.

       L0300-LEGGI-NATGIU-EX.
           EXIT.
      *=================================================================*
       VALORIZZA-OUTPUT SECTION.
      *=================================================================*
       L0250-VALORIZZA-OUT.
      *---------------------------------------------------------------*
      *    Valorizza l'elemento WS-IDX della tabella di output.

           MOVE I-FGTQ22-FG02-NDG        TO XXA344-O-NDG      (WS-IDX).
           MOVE I-FGTQ22-FG02-DTISTR     TO XXA344-O-DT-ISTR  (WS-IDX).
           MOVE I-FGTQ22-FG02-PRGISTR    TO XXA344-O-PRG-ISTR (WS-IDX).
           MOVE I-FGTQ22-FG02-IMPORTO    TO XXA344-O-IMPORTO  (WS-IDX).

           PERFORM L0260-CONVERTI-STATO  THRU L0260-CONVERTI-STATO-EX.

       L0250-VALORIZZA-OUT-EX.
           EXIT.
      *---------------------------------------------------------------*
       L0260-CONVERTI-STATO.
      *---------------------------------------------------------------*
      *    Il campo Stato in tabella e' alfanumerico di lunghezza 1.
      *    Viene convertito nella descrizione da restituire.

           MOVE SPACES                   TO XXA344-O-STATO (WS-IDX).

           EVALUATE I-FGTQ22-FG02-STATO (1:1)
              WHEN 'L'
                   MOVE 'In lavorazione' TO XXA344-O-STATO (WS-IDX)
              WHEN 'A'
                   MOVE 'Annullato'      TO XXA344-O-STATO (WS-IDX)
              WHEN 'C'
                   IF I-FGTQ22-FG02-STATOAV = 'DEL'
                      MOVE 'Deliberato'  TO XXA344-O-STATO (WS-IDX)
                   ELSE
                      MOVE I-FGTQ22-FG02-STATO
                                         TO XXA344-O-STATO (WS-IDX)
                   END-IF
              WHEN 'P'
                   MOVE 'Prenotazione'   TO XXA344-O-STATO (WS-IDX)
              WHEN OTHER
                   MOVE I-FGTQ22-FG02-STATO
                                         TO XXA344-O-STATO (WS-IDX)
           END-EVALUATE.

       L0260-CONVERTI-STATO-EX.
           EXIT.
      *=================================================================*
       CALL-FGTSQA02 SECTION.
      *=================================================================*
      *    Interfaccia DB2 generalizzata FGTSQA02 - funzione FGTS22.
       INTERF-FGTS22.
           EXEC CICS LINK PROGRAM ('FGTSQA02')
                COMMAREA          (FG02-REC)
                LENGTH            (FG02-LEN)
                END-EXEC.

       INTERF-FGTS22-EX.
           EXIT.
      *=================================================================*
       CALL-AN00C126 SECTION.
      *=================================================================*
      *    Lettura tabella 1 anagrafe - routine AN00C126.
       INTERF-AN126.
           EXEC CICS LINK PROGRAM ('AN00C126')
                COMMAREA          (AN000088)
                LENGTH            (AN0088-LEN)
                END-EXEC.

       INTERF-AN126-EX.
           EXIT.
      *=================================================================*
       FINE SECTION.
      *=================================================================*
       L9996-ERRORE.
      *---------------------------------------------------------------*
      *   GESTIONE ERRORI FORMALI NON BLOCCANTI
      *---------------------------------------------------------------*
           MOVE '01'                     TO XXA344-RC.
           MOVE 'XX0AW344'               TO XXA344-PGMERR.

           PERFORM L9999-USCITA-PGM      THRU L9999-USCITA-PGM-EX.

       L9996-ERRORE-EX.
           EXIT.
      *---------------------------------------------------------------*
       L9998-ERRORE-SQL.
      *---------------------------------------------------------------*
      *   GESTIONE ANOMALIE DB
      *---------------------------------------------------------------*
           MOVE WS-ERRORE-SQL            TO XXA344-MSG.

           MOVE 'XX0AW344'               TO XXA344-PGMERR.
           MOVE '99'                     TO XXA344-RC.

           PERFORM L9999-USCITA-PGM      THRU L9999-USCITA-PGM-EX.

       L9998-ERRORE-SQL-EX.
           EXIT.
      *---------------------------------------------------------------*
       L9999-USCITA-PGM.
      *---------------------------------------------------------------*

           GOBACK.

       L9999-USCITA-PGM-EX.
           EXIT.
      *****************************************************************
      * FINE LISTING PROGRAMMA:     XX0AW344                          *
      *****************************************************************
