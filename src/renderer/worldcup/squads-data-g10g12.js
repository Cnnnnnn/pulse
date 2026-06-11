/**
 * src/renderer/worldcup/squads-data-g10g12.js
 *
 * v2.9.7 — G10-G12 12 队 26 人大名单 (完整, FIFA 2026 报名)
 *
 * 数据来源: FlashscoreUSA 1248 players (2026-06 公布, 截止 2026-06-02)
 * 队名映射: 跟 teams-data.js FIFA 官方名 1:1
 *   - 'D.R. Congo' (Flashscore) → 'Congo DR' (FIFA)
 *   - 其它跟 Flashscore 一致
 *
 * 阵型 4-3-3 通用 (GK 3 + DF 9/10 + MF 7/8 + FW 4/6)
 * 注: 各队报名 23-26 人不等, 3 GK 必备. 队实际报名人数标在每队注释.
 *
 * Schema: [{ number, position, name, club }]
 */

const SQUADS_G10G12 = {
  // ─── Group J (4 队) ─────────────────────────────
  // Argentina — 26 人
  Argentina: [
    // GK
    { number: 1,  position: 'GK', name: 'Juan Musso',            club: 'Atletico Madrid' },
    { number: 2,  position: 'GK', name: 'Geronimo Rulli',        club: 'Marseille' },
    { number: 3,  position: 'GK', name: 'Emiliano Martinez',     club: 'Aston Villa' },
    // DF
    { number: 4,  position: 'DF', name: 'Leonardo Balerdi',      club: 'Marseille' },
    { number: 5,  position: 'DF', name: 'Nicolas Tagliafico',    club: 'Lyon' },
    { number: 6,  position: 'DF', name: 'Gonzalo Montiel',       club: 'River Plate' },
    { number: 7,  position: 'DF', name: 'Lisandro Martinez',     club: 'Manchester United' },
    { number: 8,  position: 'DF', name: 'Cristian Romero',       club: 'Tottenham' },
    { number: 9,  position: 'DF', name: 'Nicolas Otamendi',      club: 'Benfica' },
    { number: 10, position: 'DF', name: 'Facundo Medina',        club: 'Marseille' },
    { number: 11, position: 'DF', name: 'Nahuel Molina',         club: 'Atletico Madrid' },
    // MF
    { number: 12, position: 'MF', name: 'Leandro Paredes',       club: 'River Plate' },
    { number: 13, position: 'MF', name: 'Rodrigo de Paul',       club: 'Inter Miami' },
    { number: 14, position: 'MF', name: 'Valentin Barco',        club: 'Strasbourg' },
    { number: 15, position: 'MF', name: 'Giovani lo Celso',      club: 'Real Betis' },
    { number: 16, position: 'MF', name: 'Ezequiel Palacios',     club: 'Bayer Leverkusen' },
    { number: 17, position: 'MF', name: 'Alexis Mac Allister',   club: 'Liverpool' },
    { number: 18, position: 'MF', name: 'Enzo Fernandez',        club: 'Chelsea' },
    // FW
    { number: 19, position: 'FW', name: 'Julian Alvarez',        club: 'Atletico Madrid' },
    { number: 20, position: 'FW', name: 'Lionel Messi',          club: 'Inter Miami' },
    { number: 21, position: 'FW', name: 'Nicolas Gonzalez',      club: 'Atletico Madrid' },
    { number: 22, position: 'FW', name: 'Thiago Almada',         club: 'Atletico Madrid' },
    { number: 23, position: 'FW', name: 'Giuliano Simeone',      club: 'Atletico Madrid' },
    { number: 24, position: 'FW', name: 'Nico Paz',              club: 'Como' },
    { number: 25, position: 'FW', name: 'Jose Manuel Lopez',     club: 'Palmeiras' },
    { number: 26, position: 'FW', name: 'Lautaro Martinez',      club: 'Inter Milan' },
  ],
  // Algeria — 26 人
  Algeria: [
    // GK
    { number: 1,  position: 'GK', name: 'Oussama Benbot',        club: 'USM Alger' },
    { number: 2,  position: 'GK', name: 'Melvin Masstil',        club: 'Stade Nyonnaise' },
    { number: 3,  position: 'GK', name: 'Luca Zidane',           club: 'Granada' },
    // DF
    { number: 4,  position: 'DF', name: 'Achraf Abada',          club: 'USM Alger' },
    { number: 5,  position: 'DF', name: 'Rayan Ait-Nouri',       club: 'Manchester City' },
    { number: 6,  position: 'DF', name: 'Zinedine Belaid',       club: 'JS Kabylie' },
    { number: 7,  position: 'DF', name: 'Rafik Belghali',        club: 'Verona' },
    { number: 8,  position: 'DF', name: 'Ramy Bensebaini',       club: 'Borussia Dortmund' },
    { number: 9,  position: 'DF', name: 'Samir Chergui',         club: 'Paris FC' },
    { number: 10, position: 'DF', name: 'Jaouen Hadjam',         club: 'Young Boys Bern' },
    { number: 11, position: 'DF', name: 'Aissa Mandi',           club: 'Lille' },
    { number: 12, position: 'DF', name: 'Mohamed Amine Tougai',  club: 'Esperance' },
    // MF
    { number: 13, position: 'MF', name: 'Houssem Aouar',         club: 'Al Ittihad' },
    { number: 14, position: 'MF', name: 'Nabil Bentaleb',        club: 'Lille' },
    { number: 15, position: 'MF', name: 'Hicham Boudaoui',       club: 'Nice' },
    { number: 16, position: 'MF', name: 'Fares Chaibi',          club: 'Eintracht Frankfurt' },
    { number: 17, position: 'MF', name: 'Ibrahim Maza',          club: 'Bayer Leverkusen' },
    { number: 18, position: 'MF', name: 'Yassine Titraoui',      club: 'Charleroi' },
    { number: 19, position: 'MF', name: 'Ramiz Zerrouki',        club: 'Twente' },
    // FW
    { number: 20, position: 'FW', name: 'Mohamed Amine Amoura',  club: 'Wolfsburg' },
    { number: 21, position: 'FW', name: 'Nadir Benbouali',       club: 'Gyori ETO' },
    { number: 22, position: 'FW', name: 'Adil Boulbina',         club: 'Al Duhail' },
    { number: 23, position: 'FW', name: 'Fares Ghedjemis',       club: 'Frosinone' },
    { number: 24, position: 'FW', name: 'Amine Gouiri',          club: 'Marseille' },
    { number: 25, position: 'FW', name: 'Riyad Mahrez',          club: 'Al Ahli' },
    { number: 26, position: 'FW', name: 'Anis Hadj Moussa',      club: 'Feyenoord' },
  ],
  // Austria — 26 人
  Austria: [
    // GK
    { number: 1,  position: 'GK', name: 'Patrick Pentz',         club: 'Brondby' },
    { number: 2,  position: 'GK', name: 'Alexander Schlager',    club: 'RB Salzburg' },
    { number: 3,  position: 'GK', name: 'Florian Wiegele',       club: 'Viktoria Plzen' },
    // DF
    { number: 4,  position: 'DF', name: 'David Affengruber',     club: 'Elche' },
    { number: 5,  position: 'DF', name: 'David Alaba',           club: 'Real Madrid' },
    { number: 6,  position: 'DF', name: 'Kevin Danso',           club: 'Tottenham Hotspur' },
    { number: 7,  position: 'DF', name: 'Marco Friedl',          club: 'Werder Bremen' },
    { number: 8,  position: 'DF', name: 'Philipp Lienhart',      club: 'Freiburg' },
    { number: 9,  position: 'DF', name: 'Phillipp Mwene',        club: 'Mainz' },
    { number: 10, position: 'DF', name: 'Stefan Posch',          club: 'Mainz' },
    { number: 11, position: 'DF', name: 'Alexander Prass',       club: 'Hoffenheim' },
    { number: 12, position: 'DF', name: 'Michael Svoboda',       club: 'Venezia' },
    // MF
    { number: 13, position: 'MF', name: 'Carney Chukwuemeka',    club: 'Borussia Dortmund' },
    { number: 14, position: 'MF', name: 'Florian Grillitsch',    club: 'Braga' },
    { number: 15, position: 'MF', name: 'Konrad Laimer',         club: 'Bayern Munich' },
    { number: 16, position: 'MF', name: 'Marcel Sabitzer',       club: 'Borussia Dortmund' },
    { number: 17, position: 'MF', name: 'Xaver Schlager',        club: 'RB Leipzig' },
    { number: 18, position: 'MF', name: 'Romano Schmid',         club: 'Werder Bremen' },
    { number: 19, position: 'MF', name: 'Alessandro Schopf',     club: 'Wolfsberger' },
    { number: 20, position: 'MF', name: 'Nicolas Seiwald',       club: 'RB Leipzig' },
    { number: 21, position: 'MF', name: 'Paul Wanner',           club: 'PSV Eindhoven' },
    { number: 22, position: 'MF', name: 'Patrick Wimmer',        club: 'Wolfsburg' },
    // FW
    { number: 23, position: 'FW', name: 'Marko Arnautovic',      club: 'Crvena Zvezda' },
    { number: 24, position: 'FW', name: 'Michael Gregoritsch',   club: 'Augsburg' },
    { number: 25, position: 'FW', name: 'Sasa Kalajdzic',        club: 'LASK' },
    { number: 26, position: 'FW', name: 'TBD-26',                club: 'TBD' },
  ],
  // Jordan — 26 人
  Jordan: [
    // GK
    { number: 1,  position: 'GK', name: 'Yazeed Abulaila',       club: 'Al Hussein' },
    { number: 2,  position: 'GK', name: 'Abdullah Al-Fakhouri',  club: 'Al Wehdat' },
    { number: 3,  position: 'GK', name: 'Noor Bani Attiah',      club: 'Al Faisaly' },
    // DF
    { number: 4,  position: 'DF', name: 'Abdallah Nasib',        club: 'Al Zawraa' },
    { number: 5,  position: 'DF', name: 'Ehsan Haddad',          club: 'Al Hussein' },
    { number: 6,  position: 'DF', name: 'Saed Al-Rosan',         club: 'Al Hussein' },
    { number: 7,  position: 'DF', name: 'Saleem Obaid',          club: 'Al Hussein' },
    { number: 8,  position: 'DF', name: 'Yazan Al-Arab',         club: 'FC Seoul' },
    { number: 9,  position: 'DF', name: 'Mohammad Abualnadi',    club: 'Selangor' },
    { number: 10, position: 'DF', name: 'Husam Abu Dahab',       club: 'Al Faisaly' },
    { number: 11, position: 'DF', name: 'Anas Banawi',           club: 'Al Faisaly' },
    { number: 12, position: 'DF', name: 'Mohannad Abu Taha',     club: 'Al Quwa Al Jawiya' },
    { number: 13, position: 'DF', name: 'Mohammad Abu Hasheesh', club: 'Al Karma' },
    // MF
    { number: 14, position: 'MF', name: 'Noor Al Rawabdeh',      club: 'Selangor' },
    { number: 15, position: 'MF', name: 'Nizar Al Rashdan',      club: 'Qatar' },
    { number: 16, position: 'MF', name: 'Ibrahim Saadeh',        club: 'Al Karma' },
    { number: 17, position: 'MF', name: 'Rajaei Ayed',           club: 'Al Hussein' },
    { number: 18, position: 'MF', name: 'Mahmoud Al-Mardi',      club: 'Al Hussein' },
    { number: 19, position: 'MF', name: 'Amer Jamous',           club: 'Al Zawraa' },
    { number: 20, position: 'MF', name: 'Mohammad Al-Dawoud',    club: 'Al Wehdat' },
    // FW
    { number: 21, position: 'FW', name: 'Mousa Al-Tamari',       club: 'Rennes' },
    { number: 22, position: 'FW', name: 'Odeh Al-Fakhouri',      club: 'Pyramids' },
    { number: 23, position: 'FW', name: 'Mohammad Abu Zrayq',    club: 'Raja Casablanca' },
    { number: 24, position: 'FW', name: 'Ali Azaizeh',           club: 'Al Shabab' },
    { number: 25, position: 'FW', name: 'Ibrahim Sabra',         club: 'Lokomotiva Zagreb' },
    { number: 26, position: 'FW', name: 'Ali Olwan',             club: 'Al Sailiya' },
  ],

  // ─── Group K (4 队) ─────────────────────────────
  // Portugal — 26 人
  Portugal: [
    // GK
    { number: 1,  position: 'GK', name: 'Diogo Costa',           club: 'Porto' },
    { number: 2,  position: 'GK', name: 'Jose Sa',               club: 'Wolves' },
    { number: 3,  position: 'GK', name: 'Rui Silva',             club: 'Sporting' },
    // DF
    { number: 4,  position: 'DF', name: 'Diogo Dalot',           club: 'Manchester United' },
    { number: 5,  position: 'DF', name: 'Matheus Nunes',         club: 'Manchester City' },
    { number: 6,  position: 'DF', name: 'Ruben Dias',            club: 'Manchester City' },
    { number: 7,  position: 'DF', name: 'Nelson Semedo',         club: 'Fenerbahce' },
    { number: 8,  position: 'DF', name: 'Joao Cancelo',          club: 'Barcelona' },
    { number: 9,  position: 'DF', name: 'Nuno Mendes',           club: 'Paris Saint-Germain' },
    { number: 10, position: 'DF', name: 'Goncalo Inacio',        club: 'Sporting' },
    { number: 11, position: 'DF', name: 'Renato Veiga',          club: 'Villarreal' },
    { number: 12, position: 'DF', name: 'Tomas Araujo',          club: 'Benfica' },
    // MF
    { number: 13, position: 'MF', name: 'Ruben Neves',           club: 'Al Hilal' },
    { number: 14, position: 'MF', name: 'Samu Costa',            club: 'Mallorca' },
    { number: 15, position: 'MF', name: 'Joao Neves',            club: 'Paris Saint-Germain' },
    { number: 16, position: 'MF', name: 'Vitinha',               club: 'Paris Saint-Germain' },
    { number: 17, position: 'MF', name: 'Bruno Fernandes',       club: 'Manchester United' },
    { number: 18, position: 'MF', name: 'Bernardo Silva',        club: 'Manchester City' },
    // FW
    { number: 19, position: 'FW', name: 'Cristiano Ronaldo',     club: 'Al Nassr' },
    { number: 20, position: 'FW', name: 'Joao Felix',            club: 'Al Nassr' },
    { number: 21, position: 'FW', name: 'Francisco Trincao',     club: 'Sporting' },
    { number: 22, position: 'FW', name: 'Francisco Conceicao',   club: 'Juventus' },
    { number: 23, position: 'FW', name: 'Pedro Neto',            club: 'Chelsea' },
    { number: 24, position: 'FW', name: 'Rafael Leao',           club: 'AC Milan' },
    { number: 25, position: 'FW', name: 'Goncalo Guedes',        club: 'Real Sociedad' },
    { number: 26, position: 'FW', name: 'Goncalo Ramos',         club: 'Paris Saint-Germain' },
  ],
  // Congo DR — 26 人 (Flashscore 写 'D.R. Congo', FIFA 官方 'Congo DR')
  'Congo DR': [
    // GK
    { number: 1,  position: 'GK', name: 'Matthieu Epolo',        club: 'Standard Liege' },
    { number: 2,  position: 'GK', name: 'Timothy Fayulu',        club: 'Noah' },
    { number: 3,  position: 'GK', name: 'Lionel Mpasi',          club: 'Le Havre' },
    // DF
    { number: 4,  position: 'DF', name: 'Dylan Batubinsika',     club: 'Larisa' },
    { number: 5,  position: 'DF', name: 'Gedeon Kalulu',         club: 'Aris Limassol' },
    { number: 6,  position: 'DF', name: 'Steve Kapuadi',         club: 'Widzew Lodz' },
    { number: 7,  position: 'DF', name: 'Joris Kayembe',         club: 'Racing Genk' },
    { number: 8,  position: 'DF', name: 'Arthur Masuaku',        club: 'Racing Lens' },
    { number: 9,  position: 'DF', name: 'Chancel Mbemba',        club: 'Lille' },
    { number: 10, position: 'DF', name: 'Axel Tuanzebe',         club: 'Burnley' },
    { number: 11, position: 'DF', name: 'Aaron Wan-Bissaka',     club: 'West Ham' },
    // MF
    { number: 12, position: 'MF', name: 'Theo Bongonda',         club: 'Spartak Moscow' },
    { number: 13, position: 'MF', name: 'Brian Cipenga',         club: 'Castellon' },
    { number: 14, position: 'MF', name: 'Elia Meshack',          club: 'Alanyaspor' },
    { number: 15, position: 'MF', name: 'Gael Kakuta',           club: 'Larissa' },
    { number: 16, position: 'MF', name: 'Edo Kayembe',           club: 'Watford' },
    { number: 17, position: 'MF', name: 'Nathanael Mbuku',       club: 'Montpellier' },
    { number: 18, position: 'MF', name: 'Samuel Moutoussamy',    club: 'Atromitos' },
    { number: 19, position: 'MF', name: 'Ngalayel Mukau',        club: 'Lille' },
    { number: 20, position: 'MF', name: 'Charles Pickel',        club: 'Espanyol' },
    { number: 21, position: 'MF', name: 'Noah Sadiki',           club: 'Sunderland' },
    { number: 22, position: 'MF', name: 'Aaron Tshibola',        club: 'Kilmarnock' },
    // FW
    { number: 23, position: 'FW', name: 'Cedric Bakambu',        club: 'Real Betis' },
    { number: 24, position: 'FW', name: 'Simon Banza',           club: 'Al Jazira' },
    { number: 25, position: 'FW', name: 'Fiston Mayele',         club: 'Pyramids' },
    { number: 26, position: 'FW', name: 'Yoane Wissa',           club: 'Newcastle' },
  ],
  // Uzbekistan — 26 人
  Uzbekistan: [
    // GK
    { number: 1,  position: 'GK', name: 'Utkir Yusupov',         club: 'Navbahor' },
    { number: 2,  position: 'GK', name: 'Abduvohid Nematov',     club: 'Nasaf' },
    { number: 3,  position: 'GK', name: 'Botirali Ergashev',     club: 'Neftchi' },
    // DF
    { number: 4,  position: 'DF', name: 'Rustam Ashurmatov',     club: 'Esteghlal' },
    { number: 5,  position: 'DF', name: 'Farrukh Sayfiev',       club: 'Neftchi' },
    { number: 6,  position: 'DF', name: 'Khojiakbar Alijonov',   club: 'Pakhtakor' },
    { number: 7,  position: 'DF', name: 'Sherzod Nasrullaev',    club: 'Nasaf' },
    { number: 8,  position: 'DF', name: 'Umar Eshmurodov',       club: 'Nasaf' },
    { number: 9,  position: 'DF', name: 'Abdukodir Khusanov',    club: 'Manchester City' },
    { number: 10, position: 'DF', name: 'Abdulla Abdullaev',     club: 'Dibba' },
    { number: 11, position: 'DF', name: 'Bekhruz Karimov',       club: 'Surkhon' },
    { number: 12, position: 'DF', name: 'Jakhongir Urozov',      club: 'Dinamo Samarqand' },
    { number: 13, position: 'DF', name: 'Avazbek Ulmasaliev',    club: 'AGMK' },
    // MF
    { number: 14, position: 'MF', name: 'Otabek Shukurov',       club: 'Baniyas' },
    { number: 15, position: 'MF', name: 'Jaloliddin Masharipov', club: 'Esteghlal' },
    { number: 16, position: 'MF', name: 'Odiljon Hamrobekov',    club: 'Tractor' },
    { number: 17, position: 'MF', name: 'Oston Urunov',          club: 'Persepolis' },
    { number: 18, position: 'MF', name: 'Jamshid Iskanderov',    club: 'Neftchi' },
    { number: 19, position: 'MF', name: 'Dostonbek Khamdamov',   club: 'Pakhtakor' },
    { number: 20, position: 'MF', name: 'Abbosbek Fayzullaev',   club: 'Istanbul Basaksehir' },
    { number: 21, position: 'MF', name: 'Akmal Mozgovoy',        club: 'Pakhtakor' },
    { number: 22, position: 'MF', name: 'Azizjon Ganiev',       club: 'Al Bataeh' },
    { number: 23, position: 'MF', name: 'Sherzod Esanov',        club: 'Bukhara' },
    // FW
    { number: 24, position: 'FW', name: 'Eldor Shomurodov',      club: 'Istanbul Basaksehir' },
    { number: 25, position: 'FW', name: 'Igor Sergeev',          club: 'Persepolis' },
    { number: 26, position: 'FW', name: 'Azizbek Amonov',        club: 'Bukhara' },
  ],
  // Colombia — 26 人
  Colombia: [
    // GK
    { number: 1,  position: 'GK', name: 'Camilo Vargas',         club: 'Atlas' },
    { number: 2,  position: 'GK', name: 'Alvaro Montero',        club: 'Velez Sarsfield' },
    { number: 3,  position: 'GK', name: 'David Ospina',          club: 'Atletico Nacional' },
    // DF
    { number: 4,  position: 'DF', name: 'Davinson Sanchez',      club: 'Galatasaray' },
    { number: 5,  position: 'DF', name: 'Jhon Lucumi',           club: 'Bologna' },
    { number: 6,  position: 'DF', name: 'Yerry Mina',            club: 'Cagliari' },
    { number: 7,  position: 'DF', name: 'Willer Ditta',          club: 'Cruz Azul' },
    { number: 8,  position: 'DF', name: 'Daniel Munoz',          club: 'Crystal Palace' },
    { number: 9,  position: 'DF', name: 'Santiago Arias',        club: 'Independiente' },
    { number: 10, position: 'DF', name: 'Johan Mojica',          club: 'Mallorca' },
    { number: 11, position: 'DF', name: 'Deiver Machado',        club: 'Nantes' },
    // MF
    { number: 12, position: 'MF', name: 'Richard Rios',          club: 'Benfica' },
    { number: 13, position: 'MF', name: 'Jefferson Lerma',       club: 'Crystal Palace' },
    { number: 14, position: 'MF', name: 'Kevin Castano',         club: 'River Plate' },
    { number: 15, position: 'MF', name: 'Juan Camilo Portilla',  club: 'Athletico Paranaense' },
    { number: 16, position: 'MF', name: 'Gustavo Puerta',        club: 'Racing de Santander' },
    { number: 17, position: 'MF', name: 'Jhon Arias',            club: 'Palmeiras' },
    { number: 18, position: 'MF', name: 'Jorge Carrascal',       club: 'Flamengo' },
    { number: 19, position: 'MF', name: 'Juan Fernando Quintero', club: 'River Plate' },
    { number: 20, position: 'MF', name: 'James Rodriguez',       club: 'Minnesota United' },
    { number: 21, position: 'MF', name: 'Jaminton Campaz',       club: 'Rosario Central' },
    // FW
    { number: 22, position: 'FW', name: 'Juan Camilo Hernandez', club: 'Real Betis' },
    { number: 23, position: 'FW', name: 'Luis Diaz',             club: 'Bayern Munich' },
    { number: 24, position: 'FW', name: 'Luis Suarez',           club: 'Sporting' },
    { number: 25, position: 'FW', name: 'Carlos Andres Gomez',   club: 'Vasco da Gama' },
    { number: 26, position: 'FW', name: 'Jhon Cordoba',          club: 'Krasnodar' },
  ],

  // ─── Group L (4 队) ─────────────────────────────
  // England — 26 人
  England: [
    // GK
    { number: 1,  position: 'GK', name: 'Jordan Pickford',       club: 'Everton' },
    { number: 2,  position: 'GK', name: 'Dean Henderson',        club: 'Crystal Palace' },
    { number: 3,  position: 'GK', name: 'James Trafford',        club: 'Manchester City' },
    // DF
    { number: 4,  position: 'DF', name: 'Reece James',           club: 'Chelsea' },
    { number: 5,  position: 'DF', name: 'Tino Livramento',       club: 'Newcastle United' },
    { number: 6,  position: 'DF', name: 'John Stones',           club: 'Manchester City' },
    { number: 7,  position: 'DF', name: 'Marc Guehi',            club: 'Manchester City' },
    { number: 8,  position: 'DF', name: 'Ezri Konsa',            club: 'Aston Villa' },
    { number: 9,  position: 'DF', name: 'Dan Burn',              club: 'Newcastle' },
    { number: 10, position: 'DF', name: 'Jarell Quansah',        club: 'Bayer Leverkusen' },
    { number: 11, position: 'DF', name: 'Djed Spence',           club: 'Tottenham Hotspur' },
    { number: 12, position: 'DF', name: "Nico O'Reilly",         club: 'Manchester City' },
    // MF
    { number: 13, position: 'MF', name: 'Elliot Anderson',       club: 'Nottingham Forest' },
    { number: 14, position: 'MF', name: 'Jordan Henderson',      club: 'Brentford' },
    { number: 15, position: 'MF', name: 'Declan Rice',           club: 'Arsenal' },
    { number: 16, position: 'MF', name: 'Kobbie Mainoo',         club: 'Manchester United' },
    { number: 17, position: 'MF', name: 'Eberechi Eze',          club: 'Arsenal' },
    { number: 18, position: 'MF', name: 'Jude Bellingham',       club: 'Real Madrid' },
    { number: 19, position: 'MF', name: 'Morgan Rogers',         club: 'Aston Villa' },
    // FW
    { number: 20, position: 'FW', name: 'Bukayo Saka',           club: 'Arsenal' },
    { number: 21, position: 'FW', name: 'Noni Madueke',          club: 'Arsenal' },
    { number: 22, position: 'FW', name: 'Anthony Gordon',        club: 'Newcastle' },
    { number: 23, position: 'FW', name: 'Marcus Rashford',       club: 'Barcelona' },
    { number: 24, position: 'FW', name: 'Harry Kane',            club: 'Bayern Munich' },
    { number: 25, position: 'FW', name: 'Ollie Watkins',         club: 'Aston Villa' },
    { number: 26, position: 'FW', name: 'Ivan Toney',            club: 'Al Ahli' },
  ],
  // Croatia — 25 人
  Croatia: [
    // GK
    { number: 1,  position: 'GK', name: 'Dominik Livakovic',     club: 'Dinamo Zagreb' },
    { number: 2,  position: 'GK', name: 'Dominik Kotarski',     club: 'FC Copenhagen' },
    { number: 3,  position: 'GK', name: 'Ivor Pandur',           club: 'Hull' },
    // DF
    { number: 4,  position: 'DF', name: 'Josko Gvardiol',        club: 'Manchester City' },
    { number: 5,  position: 'DF', name: 'Duje Caleta-Car',       club: 'Real Sociedad' },
    { number: 6,  position: 'DF', name: 'Josip Sutalo',          club: 'Ajax' },
    { number: 7,  position: 'DF', name: 'Josip Stanisic',        club: 'Bayern Munich' },
    { number: 8,  position: 'DF', name: 'Marin Pongracic',       club: 'Fiorentina' },
    { number: 9,  position: 'DF', name: 'Martin Erlic',          club: 'Midtjylland' },
    { number: 10, position: 'DF', name: 'Luka Vuskovic',         club: 'HSV' },
    // MF
    { number: 11, position: 'MF', name: 'Luka Modric',           club: 'AC Milan' },
    { number: 12, position: 'MF', name: 'Mateo Kovacic',         club: 'Manchester City' },
    { number: 13, position: 'MF', name: 'Mario Pasalic',         club: 'Atalanta' },
    { number: 14, position: 'MF', name: 'Nikola Vlasic',         club: 'Torino' },
    { number: 15, position: 'MF', name: 'Luka Sucic',            club: 'Real Sociedad' },
    { number: 16, position: 'MF', name: 'Martin Baturina',       club: 'Como' },
    { number: 17, position: 'MF', name: 'Kristijan Jakic',       club: 'Augsburg' },
    { number: 18, position: 'MF', name: 'Petar Sucic',           club: 'Inter Milan' },
    { number: 19, position: 'MF', name: 'Nikola Moro',           club: 'Bologna' },
    { number: 20, position: 'MF', name: 'Toni Fruk',             club: 'Rijeka' },
    // FW
    { number: 21, position: 'FW', name: 'Ivan Perisic',          club: 'PSV' },
    { number: 22, position: 'FW', name: 'Andrej Kramaric',       club: 'Hoffenheim' },
    { number: 23, position: 'FW', name: 'Ante Budimir',          club: 'Osasuna' },
    { number: 24, position: 'FW', name: 'Marco Pasalic',         club: 'Orlando City' },
    { number: 25, position: 'FW', name: 'Petar Musa',            club: 'Dallas' },
    { number: 26, position: 'FW', name: 'Igor Matanovic',        club: 'Freiburg' },
  ],
  // Ghana — 26 人
  Ghana: [
    // GK
    { number: 1,  position: 'GK', name: 'Benjamin Asare',        club: 'Accra Hearts of Oak' },
    { number: 2,  position: 'GK', name: 'Lawrence Ati-Zigi',     club: 'St. Gallen' },
    { number: 3,  position: 'GK', name: 'Joseph Anang',          club: "St. Patrick's Athletic" },
    // DF
    { number: 4,  position: 'DF', name: 'Baba Abdul Rahman',     club: 'PAOK' },
    { number: 5,  position: 'DF', name: 'Gideon Mensah',         club: 'Auxerre' },
    { number: 6,  position: 'DF', name: 'Marvin Senaya',         club: 'Auxerre' },
    { number: 7,  position: 'DF', name: 'Alidu Seidu',           club: 'Rennes' },
    { number: 8,  position: 'DF', name: 'Abdul Mumin',           club: 'Rayo Vallecano' },
    { number: 9,  position: 'DF', name: 'Jerome Opoku',          club: 'Istanbul Basaksehir' },
    { number: 10, position: 'DF', name: 'Jonas Adjetey',         club: 'Wolfsburg' },
    { number: 11, position: 'DF', name: 'Kojo Oppong Peprah',    club: 'Nice' },
    { number: 12, position: 'DF', name: 'Derrick Luckassen',     club: 'Pafos' },
    { number: 13, position: 'DF', name: 'Elisha Owusu',          club: 'Auxerre' },
    // MF
    { number: 14, position: 'MF', name: 'Thomas Partey',         club: 'Villarreal' },
    { number: 15, position: 'MF', name: 'Kwasi Sibo',            club: 'Real Oviedo' },
    { number: 16, position: 'MF', name: 'Augustine Boakye',      club: 'Saint-Etienne' },
    { number: 17, position: 'MF', name: 'Caleb Yirenkyi',        club: 'FC Nordsjaelland' },
    { number: 18, position: 'MF', name: 'Abdul Fatawu',          club: 'Leicester' },
    // FW
    { number: 19, position: 'FW', name: 'Kamaldeen Sulemana',    club: 'Atlanta' },
    { number: 20, position: 'FW', name: 'Christopher Bonsu Baah', club: 'Al Qadsiah' },
    { number: 21, position: 'FW', name: 'Ernest Nuamah',         club: 'Lyon' },
    { number: 22, position: 'FW', name: 'Antoine Semenyo',       club: 'Manchester City' },
    { number: 23, position: 'FW', name: 'Brandon Thomas-Asante', club: 'Coventry' },
    { number: 24, position: 'FW', name: 'Prince Kwabena Adu',    club: 'Viktoria Plzen' },
    { number: 25, position: 'FW', name: 'Inaki Williams',        club: 'Athletic Bilbao' },
    { number: 26, position: 'FW', name: 'Jordan Ayew',           club: 'Leicester' },
  ],
  // Panama — 26 人
  Panama: [
    // GK
    { number: 1,  position: 'GK', name: 'Orlando Mosquera',      club: 'Al-Fayha' },
    { number: 2,  position: 'GK', name: 'Luis Mejia',            club: 'Nacional' },
    { number: 3,  position: 'GK', name: 'Cesar Samudio',         club: 'Marathon' },
    // DF
    { number: 4,  position: 'DF', name: 'Cesar Blackman',        club: 'Slovan Bratislava' },
    { number: 5,  position: 'DF', name: 'Jorge Gutierrez',       club: 'Deportivo La Guaira' },
    { number: 6,  position: 'DF', name: 'Amir Murillo',          club: 'Besiktas' },
    { number: 7,  position: 'DF', name: 'Fidel Escobar',         club: 'Saprissa' },
    { number: 8,  position: 'DF', name: 'Andres Andrade',        club: 'LASK' },
    { number: 9,  position: 'DF', name: 'Edgardo Farina',        club: 'Pari Nizhny Novgorod' },
    { number: 10, position: 'DF', name: 'Jose Cordoba',          club: 'Norwich' },
    { number: 11, position: 'DF', name: 'Eric Davis',            club: 'Plaza Amador' },
    { number: 12, position: 'DF', name: 'Jiovany Ramos',         club: 'Puerto Cabello' },
    { number: 13, position: 'DF', name: 'Roderick Miller',       club: 'Turan Tovuz' },
    // MF
    { number: 14, position: 'MF', name: 'Anibal Godoy',          club: 'San Diego' },
    { number: 15, position: 'MF', name: 'Adalberto Carrasquilla', club: 'UNAM' },
    { number: 16, position: 'MF', name: 'Carlos Harvey',         club: 'Minnesota United' },
    { number: 17, position: 'MF', name: 'Cristian Martinez',     club: 'Ironi Kiryat Shmona' },
    { number: 18, position: 'MF', name: 'Jose Luis Rodriguez',   club: 'Juarez' },
    { number: 19, position: 'MF', name: 'Cesar Yanis',           club: 'Cobresal' },
    { number: 20, position: 'MF', name: 'Yoel Barcenas',         club: 'Mazatlan' },
    { number: 21, position: 'MF', name: 'Alberto Quintero',      club: 'Plaza Amador' },
    { number: 22, position: 'MF', name: 'Azarias Londono',       club: 'Universidad Catolica' },
    // FW
    { number: 23, position: 'FW', name: 'Ismael Diaz',           club: 'Leon' },
    { number: 24, position: 'FW', name: 'Cecilio Waterman',      club: 'Universidad de Concepcion' },
    { number: 25, position: 'FW', name: 'Jose Fajardo',          club: 'Universidad Catolica' },
    { number: 26, position: 'FW', name: 'Tomas Rodriguez',       club: 'Saprissa' },
  ],
};

export { SQUADS_G10G12 };
