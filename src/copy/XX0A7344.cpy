      ******************************************************************
      *              C O P Y     X X 0 A 7 3 4 4                       *
      ******************************************************************
      * TRACCIATO COMMAREA                                             *
      *                                                               *
      * PROCEDURA :  ESTRAZIONE LISTA CLIENTI CON CREDITI IN CORSO    *
      * PROGRAMMA :  XX0AW344                                          *
      * WNF       :  CR0AF344                                          *
      ******************************************************************
       01 XX0A7344.
           05 XXA344-CNTRL.
              10 XXA344-FUNZ                PIC  X(02).
              10 XXA344-RC                  PIC  X(02).
              10 XXA344-RESP                PIC  X(03).
              10 XXA344-SQLCODE             PIC S9(04).
              10 XXA344-PGMERR              PIC  X(08).
              10 XXA344-MSG                 PIC  X(80).

           05 XXA344-INPUT.
              10 XXA344-I-CDISTI            PIC  9(05).
              10 XXA344-I-NCG               PIC  X(03).
              10 XXA344-I-DT-INIZIO         PIC S9(08).
              10 XXA344-I-STATO             PIC  X(30).
              10 XXA344-I-IMPORTO-DA        PIC S9(012)V9(03).
              10 XXA344-I-IMPORTO-A         PIC S9(012)V9(03).

           05 XXA344-OUTPUT.
              10 XXA344-O-TAB-CREDITI.
                 15 XXA344-O-EL-CREDITI     OCCURS 30.
                    20 XXA344-O-NDG         PIC  9(12).
                    20 XXA344-O-DT-ISTR     PIC  9(08).
                    20 XXA344-O-PRG-ISTR    PIC  9(05).
                    20 XXA344-O-STATO       PIC  X(30).
                    20 XXA344-O-IMPORTO     PIC S9(012)V9(03).
