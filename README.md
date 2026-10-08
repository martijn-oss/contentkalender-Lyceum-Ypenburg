# Contentkalender Lyceum Ypenburg

Werkboek in zes stappen voor het redactieteam: doelen en KPI's, kanalen en rollen, contentpijlers, formats, een contentkalender die zich automatisch vult, en de maandelijkse analyse. Zelfde opzet als de contentkalender van het Pieter Nieuwland College, in de huisstijl van Lyceum Ypenburg.

De pagina is statisch (HTML, CSS, JavaScript) en draait op GitHub Pages. Accounts en opslag lopen via Supabase. Iedere gebruiker heeft een eigen account en ziet alleen wat hij of zij zelf invult.

## Bestanden

| Bestand | Wat het is |
| --- | --- |
| `index.html` | De pagina zelf |
| `assets/styles.css` | Huisstijl en opmaak |
| `assets/app.js` | Tabs, invulvelden, kalender, analyse, inloggen |
| `config.js` | Supabase-URL en -key (nu leeg = demomodus) |
| `supabase/schema.sql` | Tabel, beveiliging (RLS) en realtime |

Zolang `config.js` leeg is, draait de pagina in demomodus: alles wat je invult blijft in de eigen browser en er is geen inlogscherm. Je kunt de site dus eerst live zetten en Supabase daarna koppelen.

## 1. Supabase inrichten

1. Maak op [supabase.com](https://supabase.com) een nieuw project aan. Kies een regio in de EU.
2. Open **SQL Editor**, plak de inhoud van `supabase/schema.sql` en klik op **Run**.
3. Ga naar **Authentication > URL Configuration** en vul bij **Site URL** het adres van de site in (zie stap 2, bijvoorbeeld `https://<gebruikersnaam>.github.io/<repo>/`). Zet hetzelfde adres ook bij **Redirect URLs**. Zonder deze stap werken de links in de bevestigingsmail en de wachtwoordreset niet.
4. Kopieer de **Project URL** en de **anon / publishable key** naar `config.js`. Je vindt ze via de knop **Connect** bovenaan het project, of onder **Project Settings** (Data API en API Keys).

De anon key mag in de repo staan: die is bedoeld voor de browser en de RLS-regels zorgen dat iedereen alleen de eigen rijen kan lezen en schrijven. De `service_role` key hoort nooit in deze repo.

## 2. Hosten op GitHub Pages

1. Maak een nieuwe repository aan en zet alle bestanden uit deze map in de root.
2. Ga naar **Settings > Pages**, kies **Deploy from a branch**, branch `main`, map `/ (root)`.
3. Na een minuut staat de site op `https://<gebruikersnaam>.github.io/<repo>/`.

De pagina heeft `noindex`, zodat zoekmachines hem niet opnemen.

## 3. Testen

1. Open de site en maak een account aan. Je krijgt een bevestigingsmail.
2. Log in, vul een paar velden in en kijk of de status op "Alles opgeslagen" springt.
3. Log op een tweede apparaat in: de waarden staan er, en wijzigingen verschijnen direct.
4. Test "Wachtwoord vergeten".

## Goed om te weten

- **Wie kan een account maken?** Iedereen met de link. Een gebruiker ziet alleen de eigen invoer. Wil je dat beperken, zet dan in Supabase bij **Authentication > Sign In / Providers** nieuwe aanmeldingen uit zodra het team een account heeft, en nodig nieuwe mensen daarna uit via **Authentication > Users**.
- **Mails.** De ingebouwde mailserver van Supabase verstuurt maar een paar mails per uur. Stel voor het hele team een eigen SMTP-server in onder **Authentication > Emails > SMTP Settings**.
- **Lettertype.** De huisstijl gebruikt Sofia Pro (Adobe Fonts). De kit van de schoolwebsite werkt alleen op het eigen domein, dus de pagina gebruikt Outfit als vervanger. Voeg het domein van deze site toe aan de Adobe Fonts-kit en zet de regel in de `<head>` van `index.html` aan; daarna pakt de pagina vanzelf Sofia Pro.
- **Logo.** Het logo linksboven is nagetekend als SVG. Vervang het blok `<a class="wordmark">` in `index.html` door een `<img>` als je het officiële logobestand wilt gebruiken.
- **Contentpijlers.** De negen pijlers en hun standaardverdeling zijn een voorstel op basis van de schoolwebsite. Pas namen en percentages aan in `index.html` (blok `<div class="pillars">`). Verander de `data-key` van een pijler alleen als er nog niets is ingevuld.

## Huisstijl

| Onderdeel | Waarde |
| --- | --- |
| Oranje | `#ff8100` |
| Lichtoranje (logo) | `#ffc080` |
| Geel (accent) | `#fcc600` |
| Tekst | `#4b464a` |
| Lettertype | Sofia Pro, vervanger Outfit |
| Vormtaal | rechte hoeken, volle oranje vlakken, schuine strepen |

Alle kleuren staan als variabelen bovenaan `assets/styles.css`, ook voor de donkere weergave.
