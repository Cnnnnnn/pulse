/**
 * src/renderer/worldcup/squads-data-g3g6.js
 *
 * v2.9.7 — G3-G6 16 队 26 人大名单 (完整, FIFA 2026 报名)
 *
 * 数据来源: FlashscoreUSA 1248 players (2026-06 公布, 截止 2026-06-02)
 * 队名映射: 跟 teams-data.js FIFA 官方名 1:1
 *   - 'Turkey' (Flashscore) → 'Türkiye' (FIFA)
 *   - 'Ivory Coast' (Flashscore) → "Côte d'Ivoire" (FIFA, ASCII ' 跟 teams-data 对齐)
 *   - 'Curacao' (Flashscore) → 'Curaçao' (FIFA, 保留 ç)
 *   - 其它 13 队 跟 Flashscore 1:1
 *
 * 阵型 4-3-3 通用 (GK 3 + DF 8/9/10 + MF 5/6/7/8/10 + FW 4/5/6/7/8/9)
 * 注: 各队报名 23-26 人不等, 3 GK 必备. 队实际报名人数标在每队注释.
 *   - USA 25 人 (差 1: TBD-26)
 *   - 其它 15 队 26 人 满员
 *
 * Schema: [{ number, position, name, club }]
 */

const SQUADS_G3G6 = {
  // ─── Group C (4 队) ─────────────────
  // Brazil — 26 人
  Brazil: [
    // GK
    { number: 1, position: 'GK', name: 'Alisson', club: 'Liverpool' },
    { number: 2, position: 'GK', name: 'Ederson', club: 'Fenerbahce' },
    { number: 3, position: 'GK', name: 'Weverton', club: 'Gremio' },
    // DF
    { number: 4, position: 'DF', name: 'Alex Sandro', club: 'Flamengo' },
    { number: 5, position: 'DF', name: 'Danilo', club: 'Flamengo' },
    { number: 6, position: 'DF', name: 'Leo Pereira', club: 'Flamengo' },
    { number: 7, position: 'DF', name: 'Bremer', club: 'Juventus' },
    { number: 8, position: 'DF', name: 'Douglas Santos', club: 'Zenit St Petersburg' },
    { number: 9, position: 'DF', name: 'Gabriel Magalhaes', club: 'Arsenal' },
    { number: 10, position: 'DF', name: 'Ibanez', club: 'Al-Ahli' },
    { number: 11, position: 'DF', name: 'Marquinhos', club: 'Paris Saint-Germain' },
    // MF
    { number: 12, position: 'MF', name: 'Bruno Guimaraes', club: 'Newcastle' },
    { number: 13, position: 'MF', name: 'Casemiro', club: 'Manchester United' },
    { number: 14, position: 'MF', name: 'Danilo', club: 'Botafogo' },
    { number: 15, position: 'MF', name: 'Ederson', club: 'Atalanta' },
    { number: 16, position: 'MF', name: 'Fabinho', club: 'Al-Ittihad' },
    { number: 17, position: 'MF', name: 'Lucas Paqueta', club: 'Flamengo' },
    // FW
    { number: 18, position: 'FW', name: 'Endrick', club: 'Lyon' },
    { number: 19, position: 'FW', name: 'Gabriel Martinelli', club: 'Arsenal' },
    { number: 20, position: 'FW', name: 'Igor Thiago', club: 'Brentford' },
    { number: 21, position: 'FW', name: 'Luiz Henrique', club: 'Zenit' },
    { number: 22, position: 'FW', name: 'Matheus Cunha', club: 'Manchester United' },
    { number: 23, position: 'FW', name: 'Neymar', club: 'Santos' },
    { number: 24, position: 'FW', name: 'Raphinha', club: 'Barcelona' },
    { number: 25, position: 'FW', name: 'Rayan', club: 'Bournemouth' },
    { number: 26, position: 'FW', name: 'Vinicius Junior', club: 'Real Madrid' },
  ],
  // Haiti — 26 人
  Haiti: [
    // GK
    { number: 1, position: 'GK', name: 'Josue Deverger', club: 'Cosmos Koblenz' },
    { number: 2, position: 'GK', name: 'Alexandre Pierre', club: 'Sochaux' },
    { number: 3, position: 'GK', name: 'Johnny Placide', club: 'Bastia' },
    // DF
    { number: 4, position: 'DF', name: 'Ricardo Ade', club: 'LDU Quito' },
    { number: 5, position: 'DF', name: 'Carlens Arcus', club: 'Angers' },
    { number: 6, position: 'DF', name: 'Hannes Delcroix', club: 'Lugano' },
    { number: 7, position: 'DF', name: 'Jean-Kevin Duverne', club: 'Gent' },
    { number: 8, position: 'DF', name: 'Martin Experience', club: 'AS Nancy' },
    { number: 9, position: 'DF', name: 'Duke Lacroix', club: 'Colorado Springs' },
    { number: 10, position: 'DF', name: 'Wilguens Pauguain', club: 'Zulte Waregem' },
    { number: 11, position: 'DF', name: 'Keeto Thermoncy', club: 'Young Boys II' },
    // MF
    { number: 12, position: 'MF', name: 'Jean-Ricner Bellegarde', club: 'Wolverhampton Wanderers' },
    { number: 13, position: 'MF', name: 'Jean-Jacques Danley', club: 'Philadelphia Union' },
    { number: 14, position: 'MF', name: 'Leverton Pierre', club: 'Vizela' },
    { number: 15, position: 'MF', name: 'Woodensky Pierre', club: 'Violette' },
    { number: 16, position: 'MF', name: 'Carl-Fred Sainthe', club: 'El Paso Locomotive' },
    { number: 17, position: 'MF', name: 'Dominique Simon', club: 'Tatran Presov' },
    // FW
    { number: 18, position: 'FW', name: 'Josue Casimir', club: 'Auxerre' },
    { number: 19, position: 'FW', name: 'Louicius Deedson', club: 'FC Dallas' },
    { number: 20, position: 'FW', name: 'Derrick Etienne', club: 'Toronto FC' },
    { number: 21, position: 'FW', name: 'Yassin Fortune', club: 'Vizela' },
    { number: 22, position: 'FW', name: 'Wilson Isidor', club: 'Sunderland' },
    { number: 23, position: 'FW', name: 'Lenny Joseph', club: 'Ferencvaros' },
    { number: 24, position: 'FW', name: 'Duckens Nazon', club: 'Esteghlal' },
    { number: 25, position: 'FW', name: 'Frantzdy Pierrot', club: 'Rizespor' },
    { number: 26, position: 'FW', name: 'Ruben Providence', club: 'Almere City' },
  ],
  // Morocco — 26 人
  Morocco: [
    // GK
    { number: 1, position: 'GK', name: 'Yassine Bounou', club: 'Al-Hilal' },
    { number: 2, position: 'GK', name: 'Munir El Kajoui', club: 'Berkane' },
    { number: 3, position: 'GK', name: 'Ahmed Reda Tagnaouti', club: 'Asfar' },
    // DF
    { number: 4, position: 'DF', name: 'Nayef Aguerd', club: 'Marseille' },
    { number: 5, position: 'DF', name: 'Youssef Belammari', club: 'Al Ahly' },
    { number: 6, position: 'DF', name: 'Issa Diop', club: 'Fulham' },
    { number: 7, position: 'DF', name: 'Zakaria El Ouahdi', club: 'Genk' },
    { number: 8, position: 'DF', name: 'Achraf Hakimi', club: 'Paris Saint-Germain' },
    { number: 9, position: 'DF', name: 'Redouane Halhal', club: 'KV Mechelen' },
    { number: 10, position: 'DF', name: 'Noussair Mazraoui', club: 'Manchester United' },
    { number: 11, position: 'DF', name: 'Chadi Riad', club: 'Crystal Palace' },
    { number: 12, position: 'DF', name: 'Anass Salah-Eddine', club: 'PSV, on loan from Roma' },
    // MF
    { number: 13, position: 'MF', name: 'Sofyan Amrabat', club: 'Real Betis' },
    { number: 14, position: 'MF', name: 'Ayyoub Bouaddi', club: 'Lille' },
    { number: 15, position: 'MF', name: 'Neil El Aynaoui', club: 'Roma' },
    { number: 16, position: 'MF', name: 'Bilal El Khannouss', club: 'Stuttgart' },
    { number: 17, position: 'MF', name: 'Samir El Mourabet', club: 'Strasbourg' },
    { number: 18, position: 'MF', name: 'Azzedine Ounahi', club: 'Girona' },
    { number: 19, position: 'MF', name: 'Ismael Saibari', club: 'PSV' },
    // FW
    { number: 20, position: 'FW', name: 'Ayoube Amaimouni', club: 'Eintracht Frankfurt' },
    { number: 21, position: 'FW', name: 'Brahim Diaz', club: 'Real Madrid' },
    { number: 22, position: 'FW', name: 'Ayoub El Kaabi', club: 'Olympiacos' },
    { number: 23, position: 'FW', name: 'Abdessamad Ezzalzouli', club: 'Real Betis' },
    { number: 24, position: 'FW', name: 'Yassine Gessime', club: 'Strasbourg' },
    { number: 25, position: 'FW', name: 'Soufiane Rahimi', club: 'Al-Ain' },
    { number: 26, position: 'FW', name: 'Chemsdine Talbi', club: 'Sunderland' },
  ],
  // Scotland — 26 人
  Scotland: [
    // GK
    { number: 1, position: 'GK', name: 'Craig Gordon', club: 'Hearts' },
    { number: 2, position: 'GK', name: 'Angus Gunn', club: 'Nottingham Forest' },
    { number: 3, position: 'GK', name: 'Liam Kelly', club: 'Rangers' },
    // DF
    { number: 4, position: 'DF', name: 'Grant Hanley', club: 'Hibernian' },
    { number: 5, position: 'DF', name: 'Jack Hendry', club: 'Al Etiffaq' },
    { number: 6, position: 'DF', name: 'Aaron Hickey', club: 'Brentford' },
    { number: 7, position: 'DF', name: 'Dominic Hyam', club: 'Wrexham' },
    { number: 8, position: 'DF', name: 'Scott McKenna', club: 'Dinamo Zagreb' },
    { number: 9, position: 'DF', name: 'Nathan Patterson', club: 'Everton' },
    { number: 10, position: 'DF', name: 'Anthony Ralston', club: 'Celtic' },
    { number: 11, position: 'DF', name: 'Andy Robertson', club: 'Liverpool' },
    { number: 12, position: 'DF', name: 'John Souttar', club: 'Rangers' },
    { number: 13, position: 'DF', name: 'Kieran Tierney', club: 'Celtic' },
    // MF
    { number: 14, position: 'MF', name: 'Ryan Christie', club: 'Bournemouth' },
    { number: 15, position: 'MF', name: 'Findlay Curtis', club: 'Kilmarnock' },
    { number: 16, position: 'MF', name: 'Lewis Ferguson', club: 'Bologna' },
    { number: 17, position: 'MF', name: 'Ben Gannon-Doak', club: 'Bournemouth' },
    { number: 18, position: 'MF', name: 'Tyler Fletcher', club: 'Manchester United U21' },
    { number: 19, position: 'MF', name: 'John McGinn', club: 'Aston Villa' },
    { number: 20, position: 'MF', name: 'Kenny McLean', club: 'Norwich' },
    { number: 21, position: 'MF', name: 'Scott McTominay', club: 'Napoli' },
    // FW
    { number: 22, position: 'FW', name: 'Che Adams', club: 'Torino' },
    { number: 23, position: 'FW', name: 'Lyndon Dykes', club: 'Charlton' },
    { number: 24, position: 'FW', name: 'George Hirst', club: 'Ipswich' },
    { number: 25, position: 'FW', name: 'Lawrence Shankland', club: 'Hearts' },
    { number: 26, position: 'FW', name: 'Ross Stewart', club: 'Southampton' },
  ],
  // ─── Group D (4 队) ─────────────────
  // Australia — 26 人
  Australia: [
    // GK
    { number: 1, position: 'GK', name: 'Patrick Beach', club: 'Melbourne City' },
    { number: 2, position: 'GK', name: 'Paul Izzo', club: 'Randers' },
    { number: 3, position: 'GK', name: 'Mat Ryan', club: 'Levante' },
    // DF
    { number: 4, position: 'DF', name: 'Aziz Behich', club: 'Melbourne City' },
    { number: 5, position: 'DF', name: 'Jordan Bos', club: 'Feyenoord' },
    { number: 6, position: 'DF', name: 'Cameron Burgess', club: 'Swansea City' },
    { number: 7, position: 'DF', name: 'Alessandro Circati', club: 'Parma' },
    { number: 8, position: 'DF', name: 'Milos Degenek', club: 'APOEL Nicosia' },
    { number: 9, position: 'DF', name: 'Jason Geria', club: 'Albirex Niigata' },
    { number: 10, position: 'DF', name: 'Lucas Herrington', club: 'Colorado Rapids' },
    { number: 11, position: 'DF', name: 'Jacob Italiano', club: 'Grazer AK' },
    { number: 12, position: 'DF', name: 'Harry Souttar', club: 'Leicester City' },
    { number: 13, position: 'DF', name: 'Kai Trewin', club: 'New York City FC' },
    // MF
    { number: 14, position: 'MF', name: 'Cameron Devlin', club: 'Hearts' },
    { number: 15, position: 'MF', name: 'Ajdin Hrustic', club: 'Heracles Almelo' },
    { number: 16, position: 'MF', name: 'Jackson Irvine', club: 'St. Pauli' },
    { number: 17, position: 'MF', name: 'Connor Metcalfe', club: 'St. Pauli' },
    { number: 18, position: 'MF', name: 'Paul Okon-Engstler', club: 'Sydney FC' },
    { number: 19, position: 'MF', name: 'Aiden O\'Neill', club: 'New York City FC' },
    // FW
    { number: 20, position: 'FW', name: 'Nestory Irankunda', club: 'Watford' },
    { number: 21, position: 'FW', name: 'Mathew Leckie', club: 'Melbourne City' },
    { number: 22, position: 'FW', name: 'Awer Mabil', club: 'Castellon' },
    { number: 23, position: 'FW', name: 'Mohamed Toure', club: 'Norwich City' },
    { number: 24, position: 'FW', name: 'Nishan Velupillay', club: 'Melbourne Victory' },
    { number: 25, position: 'FW', name: 'Cristian Volpato', club: 'Sassuolo' },
    { number: 26, position: 'FW', name: 'Tete Yengi', club: 'Machida Zelvia' },
  ],
  // Paraguay — 26 人
  Paraguay: [
    // GK
    { number: 1, position: 'GK', name: 'Orlando Gill', club: 'San Lorenzo' },
    { number: 2, position: 'GK', name: 'Roberto Junior Fernandez', club: 'Cerro Porteno' },
    { number: 3, position: 'GK', name: 'Gaston Oliveira', club: 'Olimpia' },
    // DF
    { number: 4, position: 'DF', name: 'Omar Alderete', club: 'Sunderland' },
    { number: 5, position: 'DF', name: 'Junior Alonso', club: 'Atletico Mineiro' },
    { number: 6, position: 'DF', name: 'Fabian Balbuena', club: 'Gremio' },
    { number: 7, position: 'DF', name: 'Juan Caceres', club: 'Dinamo Moscow' },
    { number: 8, position: 'DF', name: 'Jose Canale', club: 'Lanus' },
    { number: 9, position: 'DF', name: 'Gustavo Gomez', club: 'Palmeiras' },
    { number: 10, position: 'DF', name: 'Alexandre Maidana', club: 'Talleres' },
    { number: 11, position: 'DF', name: 'Gustavo Velazquez', club: 'Cerro Porteno' },
    // MF
    { number: 12, position: 'MF', name: 'Damian Bobadilla', club: 'Sao Paulo' },
    { number: 13, position: 'MF', name: 'Andres Cubas', club: 'Vancouver Whitecaps' },
    { number: 14, position: 'MF', name: 'Matias Galarza', club: 'Atlanta United' },
    { number: 15, position: 'MF', name: 'Kaku', club: 'Al-Ain' },
    { number: 16, position: 'MF', name: 'Diego Gomez', club: 'Brighton' },
    { number: 17, position: 'MF', name: 'Mauricio Magalhaes', club: 'Palmeiras' },
    { number: 18, position: 'MF', name: 'Braian Ojeda', club: 'Orlando City' },
    // FW
    { number: 19, position: 'FW', name: 'Miguel Almiron', club: 'Atlanta United' },
    { number: 20, position: 'FW', name: 'Alex Arce', club: 'Independiente Rivadavia' },
    { number: 21, position: 'FW', name: 'Gabriel Avalos', club: 'Independiente' },
    { number: 22, position: 'FW', name: 'Gustavo Caballero', club: 'Portsmouth, on loan from Santos' },
    { number: 23, position: 'FW', name: 'Julio Enciso', club: 'Strasbourg' },
    { number: 24, position: 'FW', name: 'Isidro Pitta', club: 'Red Bull Bragantino' },
    { number: 25, position: 'FW', name: 'Antonio Sanabria', club: 'Cremonese' },
    { number: 26, position: 'FW', name: 'Ramon Sosa', club: 'Palmeiras' },
  ],
  // Türkiye — 26 人
  'Türkiye': [
    // GK
    { number: 1, position: 'GK', name: 'Ugurcan Cakir', club: 'Galatasaray' },
    { number: 2, position: 'GK', name: 'Altay Bayindir', club: 'Manchester United' },
    { number: 3, position: 'GK', name: 'Mert Gunok', club: 'Besiktas' },
    // DF
    { number: 4, position: 'DF', name: 'Ferdi Kadioglu', club: 'Brighton' },
    { number: 5, position: 'DF', name: 'Merih Demiral', club: 'Al-Ahli' },
    { number: 6, position: 'DF', name: 'Zeki Celik', club: 'Roma' },
    { number: 7, position: 'DF', name: 'Ozan Kabak', club: 'Hoffenheim' },
    { number: 8, position: 'DF', name: 'Mert Muldur', club: 'Fenerbahce' },
    { number: 9, position: 'DF', name: 'Abdulkerim Bardakci', club: 'Galatasaray' },
    { number: 10, position: 'DF', name: 'Eren Elmali', club: 'Galatasaray' },
    { number: 11, position: 'DF', name: 'Caglar Soyuncu', club: 'Fenerbahce' },
    { number: 12, position: 'DF', name: 'Samet Akaydin', club: 'Rizespor' },
    // MF
    { number: 13, position: 'MF', name: 'Arda Guler', club: 'Real Madrid' },
    { number: 14, position: 'MF', name: 'Can Uzun', club: 'Eintracht Frankfurt' },
    { number: 15, position: 'MF', name: 'Orkun Kokcu', club: 'Besiktas' },
    { number: 16, position: 'MF', name: 'Hakan Calhanoglu', club: 'Inter' },
    { number: 17, position: 'MF', name: 'Ismail Yuksek', club: 'Fenerbahce' },
    { number: 18, position: 'MF', name: 'Kaan Ayhan', club: 'Galatasaray' },
    { number: 19, position: 'MF', name: 'Salih Ozcan', club: 'Borussia Dortmund' },
    // FW
    { number: 20, position: 'FW', name: 'Kenan Yildiz', club: 'Juventus' },
    { number: 21, position: 'FW', name: 'Baris Alper Yilmaz', club: 'Galatasaray' },
    { number: 22, position: 'FW', name: 'Kerem Akturkoglu', club: 'Fenerbahce' },
    { number: 23, position: 'FW', name: 'Yunus Akgun', club: 'Galatasaray' },
    { number: 24, position: 'FW', name: 'Oguz Aydin', club: 'Fenerbahce' },
    { number: 25, position: 'FW', name: 'Deniz Gul', club: 'Porto' },
    { number: 26, position: 'FW', name: 'Irfan Can Kahveci', club: 'Fenerbahce' },
  ],
  // USA — 25 人 (差 1: TBD-26)
  USA: [
    // GK
    { number: 1, position: 'GK', name: 'Chris Brady', club: 'Chicago Fire' },
    { number: 2, position: 'GK', name: 'Matt Freese', club: 'New York City FC' },
    { number: 3, position: 'GK', name: 'Matt Turner', club: 'New England Revolution' },
    // DF
    { number: 4, position: 'DF', name: 'Max Arfsten', club: 'Columbus Crew' },
    { number: 5, position: 'DF', name: 'Sergino Dest', club: 'PSV' },
    { number: 6, position: 'DF', name: 'Alex Freeman', club: 'Villarreal' },
    { number: 7, position: 'DF', name: 'Mark McKenzie', club: 'Toulouse' },
    { number: 8, position: 'DF', name: 'Tim Ream', club: 'New England Revolution' },
    { number: 9, position: 'DF', name: 'Chris Richards', club: 'Crystal Palace' },
    { number: 10, position: 'DF', name: 'Antonee Robinson', club: 'Fulham' },
    { number: 11, position: 'DF', name: 'Miles Robinson', club: 'FC Cincinnati' },
    { number: 12, position: 'DF', name: 'Joe Scally', club: 'Borussia Monchengladbach' },
    { number: 13, position: 'DF', name: 'Auston Trusty', club: 'Celtic' },
    // MF
    { number: 14, position: 'MF', name: 'Tyler Adams', club: 'Bournemouth' },
    { number: 15, position: 'MF', name: 'Sebastian Berhalter', club: 'Vancouver Whitecaps' },
    { number: 16, position: 'MF', name: 'Weston McKennie', club: 'Juventus' },
    { number: 17, position: 'MF', name: 'Giovanni Reyna', club: 'Borussia Monchengladbach' },
    { number: 18, position: 'MF', name: 'Cristian Roldan', club: 'Seattle Sounders' },
    { number: 19, position: 'MF', name: 'Malik Tillman', club: 'Bayer Leverkusen' },
    // FW
    { number: 20, position: 'FW', name: 'Folarin Balogun', club: 'Monaco' },
    { number: 21, position: 'FW', name: 'Ricardo Pepi', club: 'PSV' },
    { number: 22, position: 'FW', name: 'Christian Pulisic', club: 'Milan' },
    { number: 23, position: 'FW', name: 'Timothy Weah', club: 'Marseille' },
    { number: 24, position: 'FW', name: 'Haji Wright', club: 'Coventry City' },
    { number: 25, position: 'FW', name: 'Alejandro Zendejas', club: 'Club America' },
    { number: 26, position: 'FW', name: 'TBD-26', club: 'TBD' },
  ],
  // ─── Group E (4 队) ─────────────────
  // Curaçao — 26 人
  'Curaçao': [
    // GK
    { number: 1, position: 'GK', name: 'Tyrick Bodak', club: 'Telstar' },
    { number: 2, position: 'GK', name: 'Trevor Doornbusch', club: 'VVV-Venlo' },
    { number: 3, position: 'GK', name: 'Eloy Room', club: 'Miami FC' },
    // DF
    { number: 4, position: 'DF', name: 'Riechedly Bazoer', club: 'Konyaspor' },
    { number: 5, position: 'DF', name: 'Joshua Brenet', club: 'Kayserispor' },
    { number: 6, position: 'DF', name: 'Roshon Van Eijma', club: 'RKC Waalwijk' },
    { number: 7, position: 'DF', name: 'Sherel Floranus', club: 'PEC Zwolle' },
    { number: 8, position: 'DF', name: 'Deveron Fonville', club: 'NEC Nijmegen' },
    { number: 9, position: 'DF', name: 'Jurien Gaari', club: 'Abha Club' },
    { number: 10, position: 'DF', name: 'Armando Obispo', club: 'PSV Eindhoven' },
    { number: 11, position: 'DF', name: 'Shurandy Sambo', club: 'Sparta Rotterdam' },
    // MF
    { number: 12, position: 'MF', name: 'Juninho Bacuna', club: 'FC Volendam' },
    { number: 13, position: 'MF', name: 'Leandro Bacuna', club: 'Iğdır' },
    { number: 14, position: 'MF', name: 'Livano Comenencia', club: 'FC Zürich' },
    { number: 15, position: 'MF', name: 'Kevin Felida', club: 'Den Bosch' },
    { number: 16, position: 'MF', name: 'Ar’Jany Martha', club: 'Rotherham United' },
    { number: 17, position: 'MF', name: 'Tyrese Noslin', club: 'Telstar' },
    { number: 18, position: 'MF', name: 'Godfried Roemeratoe', club: 'RKC Waalwijk' },
    // FW
    { number: 19, position: 'FW', name: 'Jeremy Antonisse', club: 'AE Kifisia' },
    { number: 20, position: 'FW', name: 'Tahith Chong', club: 'Sheffield United' },
    { number: 21, position: 'FW', name: 'Kenji Gorre', club: 'Maccabi Haifa' },
    { number: 22, position: 'FW', name: 'Sontje Hansen', club: 'Middlesbrough' },
    { number: 23, position: 'FW', name: 'Gervane Kastaneer', club: 'Terengganu FC' },
    { number: 24, position: 'FW', name: 'Brandley Kuwas', club: 'FC Volendam' },
    { number: 25, position: 'FW', name: 'Jurgen Locadia', club: 'Miami FC' },
    { number: 26, position: 'FW', name: 'Jearl Margaritha', club: 'SK Beveren' },
  ],
  // Ecuador — 26 人
  Ecuador: [
    // GK
    { number: 1, position: 'GK', name: 'Hernan Galindez', club: 'Huracan' },
    { number: 2, position: 'GK', name: 'Moises Ramirez', club: 'Kifisias' },
    { number: 3, position: 'GK', name: 'Gonzalo Valle', club: 'LD Quito' },
    // DF
    { number: 4, position: 'DF', name: 'Pervis Estupinan', club: 'Milan' },
    { number: 5, position: 'DF', name: 'Piero Hincapie', club: 'Arsenal, on loan from Bayer Leverkusen' },
    { number: 6, position: 'DF', name: 'Yaimar Medina', club: 'Genk' },
    { number: 7, position: 'DF', name: 'Joel Ordonez', club: 'Club Brugge' },
    { number: 8, position: 'DF', name: 'Willian Pacho', club: 'Paris Saint-Germain' },
    { number: 9, position: 'DF', name: 'Jackson Porozo', club: 'Club Tijuana' },
    { number: 10, position: 'DF', name: 'Angelo Preciado', club: 'Atletico Mineiro' },
    { number: 11, position: 'DF', name: 'Felix Torres', club: 'Internacional' },
    // MF
    { number: 12, position: 'MF', name: 'Jordy Alcivar', club: 'Independiente del Valle' },
    { number: 13, position: 'MF', name: 'Nilson Angulo', club: 'Sunderland' },
    { number: 14, position: 'MF', name: 'Moises Caicedo', club: 'Chelsea' },
    { number: 15, position: 'MF', name: 'Denil Castillo', club: 'Midtjylland' },
    { number: 16, position: 'MF', name: 'Alan Franco', club: 'Atletico Mineiro' },
    { number: 17, position: 'MF', name: 'Alan Minda', club: 'Atletico Mineiro' },
    { number: 18, position: 'MF', name: 'Kendry Paez', club: 'River Plate' },
    { number: 19, position: 'MF', name: 'Pedro Vite', club: 'Pumas' },
    // FW
    { number: 20, position: 'FW', name: 'Jeremy Arevalo', club: 'Stuttgart' },
    { number: 21, position: 'FW', name: 'Jordy Caicedo', club: 'Huracan' },
    { number: 22, position: 'FW', name: 'Gonzalo Plata', club: 'Flamengo' },
    { number: 23, position: 'FW', name: 'Anthony Valencia', club: 'Royal Antwerp' },
    { number: 24, position: 'FW', name: 'Enner Valencia', club: 'Pachuca' },
    { number: 25, position: 'FW', name: 'Kevin Rodriguez', club: 'Union Saint-Gilloise' },
    { number: 26, position: 'FW', name: 'John Yeboah', club: 'Venezia' },
  ],
  // Germany — 26 人
  Germany: [
    // GK
    { number: 1, position: 'GK', name: 'Oliver Baumann', club: 'Hoffenheim' },
    { number: 2, position: 'GK', name: 'Manuel Neuer', club: 'Bayern Munich' },
    { number: 3, position: 'GK', name: 'Alexander Nubel', club: 'Stuttgart' },
    // DF
    { number: 4, position: 'DF', name: 'Waldemar Anton', club: 'Borussia Dortmund' },
    { number: 5, position: 'DF', name: 'Nathaniel Brown', club: 'Eintracht Frankfurt' },
    { number: 6, position: 'DF', name: 'Joshua Kimmich', club: 'Bayern Munich' },
    { number: 7, position: 'DF', name: 'David Raum', club: 'RB Leipzig' },
    { number: 8, position: 'DF', name: 'Antonio Rudiger', club: 'Real Madrid' },
    { number: 9, position: 'DF', name: 'Nico Schlotterbeck', club: 'Borussia Dortmund' },
    { number: 10, position: 'DF', name: 'Jonathan Tah', club: 'Bayern Munich' },
    { number: 11, position: 'DF', name: 'Malick Thiaw', club: 'Newcastle' },
    // MF
    { number: 12, position: 'MF', name: 'Nadiem Amiri', club: 'Mainz' },
    { number: 13, position: 'MF', name: 'Leon Goretzka', club: 'Bayern Munich' },
    { number: 14, position: 'MF', name: 'Pascal Gross', club: 'Brighton' },
    { number: 15, position: 'MF', name: 'Jamie Leweling', club: 'Stuttgart' },
    { number: 16, position: 'MF', name: 'Jamal Musiala', club: 'Bayern Munich' },
    { number: 17, position: 'MF', name: 'Felix Nmecha', club: 'Borussia Dortmund' },
    { number: 18, position: 'MF', name: 'Assan Ouedraogo', club: 'RB Leipzig' },
    { number: 19, position: 'MF', name: 'Aleksandar Pavlovic', club: 'Bayern Munich' },
    { number: 20, position: 'MF', name: 'Angelo Stiller', club: 'Stuttgart' },
    { number: 21, position: 'MF', name: 'Florian Wirtz', club: 'Liverpool' },
    // FW
    { number: 22, position: 'FW', name: 'Maximilian Beier', club: 'Borussia Dortmund' },
    { number: 23, position: 'FW', name: 'Kai Havertz', club: 'Arsenal' },
    { number: 24, position: 'FW', name: 'Leroy Sane', club: 'Galatasaray' },
    { number: 25, position: 'FW', name: 'Deniz Undav', club: 'Stuttgart' },
    { number: 26, position: 'FW', name: 'Nick Woltemade', club: 'Newcastle' },
  ],
  // Côte d'Ivoire — 26 人 (key 跟 teams-data.js 1:1, ASCII ' 跟 teams-data 对齐)
  "Côte d'Ivoire": [
    // GK
    { number: 1, position: 'GK', name: 'Yahia Fofana', club: 'Rizespor' },
    { number: 2, position: 'GK', name: 'Mohamed Kone', club: 'Charleroi' },
    { number: 3, position: 'GK', name: 'Alban Lafont', club: 'Panathinaikos' },
    // DF
    { number: 4, position: 'DF', name: 'Emmanuel Agbadou', club: 'Besiktas' },
    { number: 5, position: 'DF', name: 'Christopher Operi', club: 'Istanbul Basaksehir' },
    { number: 6, position: 'DF', name: 'Ousmane Diomande', club: 'Sporting CP' },
    { number: 7, position: 'DF', name: 'Guela Doue', club: 'Strasbourg' },
    { number: 8, position: 'DF', name: 'Ghislain Konan', club: 'Gil Vicente' },
    { number: 9, position: 'DF', name: 'Odilon Kossounou', club: 'Atalanta' },
    { number: 10, position: 'DF', name: 'Evan Ndicka', club: 'Roma' },
    { number: 11, position: 'DF', name: 'Wilfried Singo', club: 'Galatasaray' },
    // MF
    { number: 12, position: 'MF', name: 'Seko Fofana', club: 'Stade Rennais' },
    { number: 13, position: 'MF', name: 'Parfait Guiagon', club: 'Charleroi' },
    { number: 14, position: 'MF', name: 'Christ Inao Oulai', club: 'Trabzonspor' },
    { number: 15, position: 'MF', name: 'Franck Kessie', club: 'Al Ahli' },
    { number: 16, position: 'MF', name: 'Ibrahim Sangare', club: 'Nottingham Forest' },
    { number: 17, position: 'MF', name: 'Jean Seri', club: 'NK Maribor' },
    // FW
    { number: 18, position: 'FW', name: 'Simon Adingra', club: 'Monaco' },
    { number: 19, position: 'FW', name: 'Ange-Yoan Bonny', club: 'Inter' },
    { number: 20, position: 'FW', name: 'Amad Diallo', club: 'Manchester United' },
    { number: 21, position: 'FW', name: 'Oumar Diakite', club: 'Cercle Brugge' },
    { number: 22, position: 'FW', name: 'Yan Diomande', club: 'RB Leipzig' },
    { number: 23, position: 'FW', name: 'Evann Guessand', club: 'Aston Villa' },
    { number: 24, position: 'FW', name: 'Nicolas Pepe', club: 'Villarreal' },
    { number: 25, position: 'FW', name: 'Bazoumana Toure', club: 'Hoffenheim' },
    { number: 26, position: 'FW', name: 'Elye Wahi', club: 'Nice' },
  ],
  // ─── Group F (4 队) ─────────────────
  // Japan — 26 人
  Japan: [
    // GK
    { number: 1, position: 'GK', name: 'Tomoki Hayakawa', club: 'Kashima Antlers' },
    { number: 2, position: 'GK', name: 'Keisuke Osako', club: 'Hiroshima' },
    { number: 3, position: 'GK', name: 'Zion Suzuki', club: 'Parma' },
    // DF
    { number: 4, position: 'DF', name: 'Ko Itakura', club: 'Ajax' },
    { number: 5, position: 'DF', name: 'Hiroki Ito', club: 'Bayern Munich' },
    { number: 6, position: 'DF', name: 'Yuto Nagatomo', club: 'FC Tokyo' },
    { number: 7, position: 'DF', name: 'Ayumu Seko', club: 'Le Havre' },
    { number: 8, position: 'DF', name: 'Yukinari Sugawara', club: 'Werder Bremen' },
    { number: 9, position: 'DF', name: 'Junnosuke Suzuki', club: 'FC Kopenhagen' },
    { number: 10, position: 'DF', name: 'Shogo Taniguchi', club: 'Sint-Truiden' },
    { number: 11, position: 'DF', name: 'Takehiro Tomiyasu', club: 'Ajax' },
    { number: 12, position: 'DF', name: 'Tsuyoshi Watanabe', club: 'Feyenoord' },
    // MF
    { number: 13, position: 'MF', name: 'Wataru Endo', club: 'Liverpool' },
    { number: 14, position: 'MF', name: 'Daichi Kamada', club: 'Crystal Palace' },
    { number: 15, position: 'MF', name: 'Ao Tanaka', club: 'Leeds United' },
    { number: 16, position: 'MF', name: 'Kaishu Sano', club: 'Mainz' },
    { number: 17, position: 'MF', name: 'Yuito Suzuki', club: 'Freiburg' },
    // FW
    { number: 18, position: 'FW', name: 'Ritsu Doan', club: 'Eintracht Frankfurt' },
    { number: 19, position: 'FW', name: 'Keisuke Goto', club: 'Sint-Truiden' },
    { number: 20, position: 'FW', name: 'Junya Ito', club: 'Genk' },
    { number: 21, position: 'FW', name: 'Takefusa Kubo', club: 'Real Sociedad' },
    { number: 22, position: 'FW', name: 'Daizen Maeda', club: 'Celtic' },
    { number: 23, position: 'FW', name: 'Keito Nakamura', club: 'Stade Reims' },
    { number: 24, position: 'FW', name: 'Koki ⁠Ogawa', club: 'NEC Nijmegen' },
    { number: 25, position: 'FW', name: 'Kento Shiogai', club: 'Wolfsburg' },
    { number: 26, position: 'FW', name: 'Ayase Ueda', club: 'Feyenoord' },
  ],
  // Netherlands — 26 人
  Netherlands: [
    // GK
    { number: 1, position: 'GK', name: 'Mark Flekken', club: 'Bayer Leverkusen' },
    { number: 2, position: 'GK', name: 'Robin Roefs', club: 'Sunderland' },
    { number: 3, position: 'GK', name: 'Bart Verbruggen', club: 'Brighton' },
    // DF
    { number: 4, position: 'DF', name: 'Nathan Aké', club: 'Manchester City' },
    { number: 5, position: 'DF', name: 'Denzel Dumfries', club: 'Inter' },
    { number: 6, position: 'DF', name: 'Lutsharel Geertruida', club: 'Sunderland, on loan from RB Leipzig' },
    { number: 7, position: 'DF', name: 'Jorrel Hato', club: 'Chelsea' },
    { number: 8, position: 'DF', name: 'Micky van de Ven', club: 'Spurs' },
    { number: 9, position: 'DF', name: 'Virgil van Dijk', club: 'Liverpool' },
    { number: 10, position: 'DF', name: 'Jan Paul van Hecke', club: 'Brighton' },
    { number: 11, position: 'DF', name: 'Mats Wieffer', club: 'Brighton' },
    // MF
    { number: 12, position: 'MF', name: 'Frenkie de Jong', club: 'FC Barcelona' },
    { number: 13, position: 'MF', name: 'Marten de Roon', club: 'Atalanta' },
    { number: 14, position: 'MF', name: 'Ryan Gravenberch', club: 'Liverpool' },
    { number: 15, position: 'MF', name: 'Justin Kluivert', club: 'Bournemouth' },
    { number: 16, position: 'MF', name: 'Teun Koopmeiners', club: 'Juventus' },
    { number: 17, position: 'MF', name: 'Tijjani Reijnders', club: 'Manchester City' },
    { number: 18, position: 'MF', name: 'Guus Til', club: 'PSV' },
    { number: 19, position: 'MF', name: 'Quinten Timber', club: 'Olympique Marseille' },
    // FW
    { number: 20, position: 'FW', name: 'Brian Brobbey', club: 'Sunderland' },
    { number: 21, position: 'FW', name: 'Memphis Depay', club: 'Corinthians' },
    { number: 22, position: 'FW', name: 'Cody Gakpo', club: 'Liverpool' },
    { number: 23, position: 'FW', name: 'Noa Lang', club: 'Galatasaray, on loan from Napoli' },
    { number: 24, position: 'FW', name: 'Donyell Malen', club: 'Roma' },
    { number: 25, position: 'FW', name: 'Crysencio Summerville', club: 'West Ham' },
    { number: 26, position: 'FW', name: 'Wout Weghorst', club: 'Ajax' },
  ],
  // Sweden — 26 人
  Sweden: [
    // GK
    { number: 1, position: 'GK', name: 'Kristoffer Nordfeldt', club: 'AIK' },
    { number: 2, position: 'GK', name: 'Viktor Johansson', club: 'Stoke City' },
    { number: 3, position: 'GK', name: 'Jacob Widell Zetterstrom', club: 'Derby County' },
    // DF
    { number: 4, position: 'DF', name: 'Gustaf Lagerbielke', club: 'Braga' },
    { number: 5, position: 'DF', name: 'Victor Lindelof', club: 'Aston Villa' },
    { number: 6, position: 'DF', name: 'Gabriel Gudmundsson', club: 'Leeds United' },
    { number: 7, position: 'DF', name: 'Daniel Svensson', club: 'Borussia Dortmund' },
    { number: 8, position: 'DF', name: 'Elliot Stroud', club: 'Mjallby' },
    { number: 9, position: 'DF', name: 'Carl Starfelt', club: 'Celta Vigo' },
    { number: 10, position: 'DF', name: 'Isak Hien', club: 'Atalanta' },
    { number: 11, position: 'DF', name: 'Hjalmar Ekdal', club: 'Burnley' },
    { number: 12, position: 'DF', name: 'Eric Smith', club: 'St. Pauli' },
    // MF
    { number: 13, position: 'MF', name: 'Lucas Bergvall', club: 'Tottenham Hotspur' },
    { number: 14, position: 'MF', name: 'Herman Johansson', club: 'FC Dallas' },
    { number: 15, position: 'MF', name: 'Jesper Karlstrom', club: 'Udinese' },
    { number: 16, position: 'MF', name: 'Yasin Ayari', club: 'Brighton & Hove Albion' },
    { number: 17, position: 'MF', name: 'Mattias Svanberg', club: 'Wolfsburg' },
    { number: 18, position: 'MF', name: 'Besfort Zeneli', club: 'Union Saint-Gilloise' },
    { number: 19, position: 'MF', name: 'Ken Sema', club: 'Pafos' },
    // FW
    { number: 20, position: 'FW', name: 'Gustaf Nilsson', club: 'Club Brugge' },
    { number: 21, position: 'FW', name: 'Benjamin Nygren', club: 'Celtic' },
    { number: 22, position: 'FW', name: 'Anthony Elanga', club: 'Newcastle United' },
    { number: 23, position: 'FW', name: 'Viktor Gyokeres', club: 'Arsenal' },
    { number: 24, position: 'FW', name: 'Taha Ali', club: 'Malmo' },
    { number: 25, position: 'FW', name: 'Alexander Isak', club: 'Liverpool' },
    { number: 26, position: 'FW', name: 'Alexander Bernhardsson', club: 'Holstein Kiel' },
  ],
  // Tunisia — 26 人
  Tunisia: [
    // GK
    { number: 1, position: 'GK', name: 'Aymen Dahmen', club: 'CS Sfaxien' },
    { number: 2, position: 'GK', name: 'Sabri Ben Hessen', club: 'Etoile du Sahel' },
    { number: 3, position: 'GK', name: 'Abdelmouhib Chamakh', club: 'Club Africain' },
    // DF
    { number: 4, position: 'DF', name: 'Montassar Talbi', club: 'Lorient' },
    { number: 5, position: 'DF', name: 'Dylan Bronn', club: 'Servette' },
    { number: 6, position: 'DF', name: 'Omar Rekik', club: 'Maribor' },
    { number: 7, position: 'DF', name: 'Yan Valery', club: 'Young Boys' },
    { number: 8, position: 'DF', name: 'Ali Abdi', club: 'Nice' },
    { number: 9, position: 'DF', name: 'Moutaz Neffati', club: 'IFK Norrköping' },
    { number: 10, position: 'DF', name: 'Raed Chikhaoui', club: 'Monastir' },
    { number: 11, position: 'DF', name: 'Adem Arous', club: 'Kasimpasa' },
    { number: 12, position: 'DF', name: 'Mohamed Ben Hamida', club: 'Esperance Tunis' },
    // MF
    { number: 13, position: 'MF', name: 'Ellyes Skhiri', club: 'Eintracht Frankfurt' },
    { number: 14, position: 'MF', name: 'Hannibal Mejbri', club: 'Burnley' },
    { number: 15, position: 'MF', name: 'Anis Ben Slimane', club: 'Norwich City' },
    { number: 16, position: 'MF', name: 'Rani Khedira', club: 'Union Berlin' },
    { number: 17, position: 'MF', name: 'Mohamed Hadj-Mahmoud', club: 'FC Lugano' },
    { number: 18, position: 'MF', name: 'Mortadha Ben Ouanes', club: 'Kasımpasa' },
    // FW
    { number: 19, position: 'FW', name: 'Elyes Achouri', club: 'Eintracht Frankfurt' },
    { number: 20, position: 'FW', name: 'Ismael Gharbi', club: 'FC Augsburg' },
    { number: 21, position: 'FW', name: 'Elias Saad', club: 'Hannover 96' },
    { number: 22, position: 'FW', name: 'Sebastian Tounekti', club: 'Celtic' },
    { number: 23, position: 'FW', name: 'Firas Chaouat', club: 'Club Africain' },
    { number: 24, position: 'FW', name: 'Khalil Ayari', club: 'Paris Saint-Germain' },
    { number: 25, position: 'FW', name: 'Hazem Mastouri', club: 'Dynamo Makhachkala' },
    { number: 26, position: 'FW', name: 'Rayan Elloumi', club: 'Vancouver Whitecaps' },
  ],
};

export { SQUADS_G3G6 };
export default SQUADS_G3G6;