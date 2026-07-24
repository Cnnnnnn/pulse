/**
 * src/renderer/worldcup/squads-data-g7g9.js
 *
 * v2.9.7 — G7-G9 12 队 26 人大名单 (完整, FIFA 2026 报名)
 *
 * 数据来源: FlashscoreUSA 1248 players (2026-06 公布, 截止 2026-06-02)
 * 队名映射: 跟 teams-data.js FIFA 官方名 1:1
 *   - 'Cape Verde' (Flashscore) → 'Cabo Verde' (FIFA)
 *   - 'Iran' (Flashscore) → 'IR Iran' (FIFA)
 *   - 其它 10 队 跟 Flashscore 1:1
 *
 * 12 队: G7 Belgium / Egypt / IR Iran / New Zealand
 *        G8 Cabo Verde / Saudi Arabia / Spain / Uruguay
 *        G9 France / Iraq / Norway / Senegal
 *
 * 阵型 4-3-3 通用 (GK 3 + DF 9/10/11 + MF 5/6/7/8 + FW 3/4/6/7/8/9)
 * 注: 各队报名 23-26 人不等, 3 GK 必备. 队实际报名人数标在每队注释.
 *   - IR Iran 24 人 (差 2: TBD-25, TBD-26)
 *   - Iraq 23 人 (差 3: TBD-24, TBD-25, TBD-26)
 *   - 其它 10 队 26 人 满员
 *
 * Schema: [{ number, position, name, club }]
 */

const SQUADS_G7G9 = {
  // ─── Group G (4 队) ─────────────────────────────
  // Belgium — 26 人
  Belgium: [
    // GK
    { number: 1,  position: 'GK', name: 'Thibaut Courtois',         club: 'Real Madrid' },
    { number: 2,  position: 'GK', name: 'Senne Lammens',            club: 'Manchester United' },
    { number: 3,  position: 'GK', name: 'Mike Penders',             club: 'Racing Strasbourg' },
    // DF
    { number: 4,  position: 'DF', name: 'Timothy Castagne',        club: 'Fulham' },
    { number: 5,  position: 'DF', name: 'Zeno Debast',              club: 'Sporting Lisbon' },
    { number: 6,  position: 'DF', name: 'Maxim De Cuyper',          club: 'Brighton & Hove Albion' },
    { number: 7,  position: 'DF', name: 'Koni De Winter',           club: 'AC Milan' },
    { number: 8,  position: 'DF', name: 'Brandon Mechele',          club: 'Club Brugge' },
    { number: 9,  position: 'DF', name: 'Thomas Meunier',           club: 'Lille' },
    { number: 10, position: 'DF', name: 'Nathan Ngoy',              club: 'Lille' },
    { number: 11, position: 'DF', name: 'Joaquin Seys',             club: 'Club Brugge' },
    { number: 12, position: 'DF', name: 'Arthur Theate',            club: 'Eintracht Frankfurt' },
    // MF
    { number: 13, position: 'MF', name: 'Kevin De Bruyne',          club: 'Napoli' },
    { number: 14, position: 'MF', name: 'Amadou Onana',             club: 'Aston Villa' },
    { number: 15, position: 'MF', name: 'Nicolas Raskin',           club: 'Rangers' },
    { number: 16, position: 'MF', name: 'Youri Tielemans',          club: 'Aston Villa' },
    { number: 17, position: 'MF', name: 'Hans Vanaken',             club: 'Club Brugge' },
    { number: 18, position: 'MF', name: 'Axel Witsel',              club: 'Girona' },
    // FW
    { number: 19, position: 'FW', name: 'Charles De Ketelaere',     club: 'Atalanta' },
    { number: 20, position: 'FW', name: 'Jeremy Doku',              club: 'Manchester City' },
    { number: 21, position: 'FW', name: 'Matias Fernandez-Pardo',   club: 'Lille' },
    { number: 22, position: 'FW', name: 'Romelu Lukaku',            club: 'Napoli' },
    { number: 23, position: 'FW', name: 'Dodi Lukebakio',           club: 'Benfica' },
    { number: 24, position: 'FW', name: 'Diego Moreira',            club: 'Racing Strasbourg' },
    { number: 25, position: 'FW', name: 'Alexis Saelemaekers',      club: 'AC Milan' },
    { number: 26, position: 'FW', name: 'Leandro Trossard',         club: 'Arsenal' },
  ],

  // Egypt — 26 人
  Egypt: [
    // GK
    { number: 1,  position: 'GK', name: 'Mohamed El Shenawy',       club: 'Al Ahly' },
    { number: 2,  position: 'GK', name: 'Mostafa Shobeir',          club: 'Al Ahly' },
    { number: 3,  position: 'GK', name: 'El Mahdi Soliman',         club: 'Zamalek' },
    { number: 4,  position: 'GK', name: 'Mohamed Alaa',             club: 'El Gouna' },
    // DF
    { number: 5,  position: 'DF', name: 'Mohamed Hany',             club: 'Al Ahly' },
    { number: 6,  position: 'DF', name: 'Tarek Alaa',               club: 'Zed' },
    { number: 7,  position: 'DF', name: 'Hamdy Fathy',              club: 'Al Wakrah' },
    { number: 8,  position: 'DF', name: 'Rami Rabia',               club: 'Al Ain' },
    { number: 9,  position: 'DF', name: 'Yasser Ibrahim',           club: 'Al Ahly' },
    { number: 10, position: 'DF', name: 'Hossam Abdelmaguid',       club: 'Zamalek' },
    { number: 11, position: 'DF', name: 'Mohamed Abdelmonemn',      club: 'Nice' },
    { number: 12, position: 'DF', name: 'Ahmed Fatouh',             club: 'Zamalek' },
    { number: 13, position: 'DF', name: 'Karim Hafez',              club: 'Pyramids' },
    // MF
    { number: 14, position: 'MF', name: 'Marwan Otaka',             club: 'Al Ahly' },
    { number: 15, position: 'MF', name: 'Mohanad Lasheen',          club: 'Pyramids' },
    { number: 16, position: 'MF', name: 'Nabil Dunga',              club: 'Al Najma' },
    { number: 17, position: 'MF', name: 'Mahmoud Saber',            club: 'Zed' },
    { number: 18, position: 'MF', name: 'Ahmed Zizo',               club: 'Al Ahly' },
    { number: 19, position: 'MF', name: 'Emam Ashour',              club: 'Al Ahly' },
    { number: 20, position: 'MF', name: 'Mostafa Ziko',             club: 'Pyramids' },
    { number: 21, position: 'MF', name: 'Mahmoud Trezeguet',        club: 'Al Ahly' },
    { number: 22, position: 'MF', name: 'Ibrahim Adel',             club: 'Nordsjaelland' },
    { number: 23, position: 'MF', name: 'Haissem Hassan',           club: 'Real Ovideo' },
    // FW
    { number: 24, position: 'FW', name: 'Omar Marmoush',            club: 'Manchester City' },
    { number: 25, position: 'FW', name: 'Mohamed Salah',            club: 'Liverpool' },
    { number: 26, position: 'FW', name: 'Hamza Abdelkarim',         club: 'Barcelona U19' },
  ],

  // IR Iran — 24 人 (差 2: TBD-25, TBD-26)
  'IR Iran': [
    // GK
    { number: 1,  position: 'GK', name: 'Alireza Beiranvand',       club: 'Tractor' },
    { number: 2,  position: 'GK', name: 'Seyed Hossein Hosseini',   club: 'Sepahan' },
    { number: 3,  position: 'GK', name: 'Payam Niazmand',           club: 'Persepolis' },
    // DF
    { number: 4,  position: 'DF', name: 'Danial Eiri',              club: 'Malavan' },
    { number: 5,  position: 'DF', name: 'Ehsan Hajsafi',            club: 'Sepahan' },
    { number: 6,  position: 'DF', name: 'Saleh Hardani',            club: 'Esteghlal' },
    { number: 7,  position: 'DF', name: 'Hossein Kanaani',          club: 'Persepolis' },
    { number: 8,  position: 'DF', name: 'Shoja Khalilzadeh',        club: 'Tractor' },
    { number: 9,  position: 'DF', name: 'Milad Mohammadi',          club: 'Persepolis' },
    { number: 10, position: 'DF', name: 'Ali Nemati',               club: 'Foolad' },
    { number: 11, position: 'DF', name: 'Ramin Rezaeian',           club: 'Foolad' },
    // MF
    { number: 12, position: 'MF', name: 'Rouzbeh Cheshmi',          club: 'Esteghlal' },
    { number: 13, position: 'MF', name: 'Saeid Ezatolahi',          club: 'Shabab Al Ahli' },
    { number: 14, position: 'MF', name: 'Mehdi Ghaedi',             club: 'Al Nasr' },
    { number: 15, position: 'MF', name: 'Saman Ghoddos',            club: 'Kalba' },
    { number: 16, position: 'MF', name: 'Mohammad Ghorbani',        club: 'Al Wahda' },
    { number: 17, position: 'MF', name: 'Alireza Jahanbakhsh',      club: 'Dender' },
    { number: 18, position: 'MF', name: 'Mohammad Mohebi',          club: 'Rostov' },
    { number: 19, position: 'MF', name: 'Amir Mohammad Razzaghinia', club: 'Esteghlal' },
    { number: 20, position: 'MF', name: 'Mehdi Torabi',             club: 'Tractor' },
    { number: 21, position: 'MF', name: 'Aria Yousefi',             club: 'Sepahan' },
    // FW
    { number: 22, position: 'FW', name: 'Ali Alipour',              club: 'Persepolis' },
    { number: 23, position: 'FW', name: 'Dennis Eckert Dargahi',    club: 'Standard Liege' },
    { number: 24, position: 'FW', name: 'Amirhossein Hosseinzadeh', club: 'Tractor' },
    { number: 25, position: 'FW', name: 'TBD-25',                   club: 'TBD' },
    { number: 26, position: 'FW', name: 'TBD-26',                   club: 'TBD' },
  ],

  // New Zealand — 26 人
  'New Zealand': [
    // GK
    { number: 1,  position: 'GK', name: 'Max Crocombe',             club: 'Millwall' },
    { number: 2,  position: 'GK', name: 'Alex Paulsen',             club: 'Lechia Gdansk' },
    { number: 3,  position: 'GK', name: 'Michael Woud',             club: 'Auckland FC' },
    // DF
    { number: 4,  position: 'DF', name: 'Tyler Bindon',             club: 'Sheffield United (loan from Nottingham Forest)' },
    { number: 5,  position: 'DF', name: 'Michael Boxall',           club: 'Minnesota United' },
    { number: 6,  position: 'DF', name: 'Liberato Cacace',          club: 'Wrexham' },
    { number: 7,  position: 'DF', name: 'Francis de Vries',        club: 'Auckland FC' },
    { number: 8,  position: 'DF', name: 'Callan Elliot',            club: 'Auckland FC' },
    { number: 9,  position: 'DF', name: 'Tim Payne',                club: 'Wellington Phoenix' },
    { number: 10, position: 'DF', name: 'Nando Pijnaker',           club: 'Auckland FC' },
    { number: 11, position: 'DF', name: 'Tommy Smith',              club: 'Braintree Town' },
    { number: 12, position: 'DF', name: 'Finn Surman',              club: 'Portland Timbers' },
    // MF
    { number: 13, position: 'MF', name: 'Lachlan Bayliss',          club: 'Newcastle Jets' },
    { number: 14, position: 'MF', name: 'Joe Bell',                 club: 'Viking' },
    { number: 15, position: 'MF', name: 'Matt Garbett',             club: 'Peterborough' },
    { number: 16, position: 'MF', name: 'Ben Old',                  club: 'Saint-Etienne' },
    { number: 17, position: 'MF', name: 'Alex Rufer',               club: 'Wellington Phoenix' },
    { number: 18, position: 'MF', name: 'Sarpreet Singh',           club: 'Wellington Phoenix' },
    { number: 19, position: 'MF', name: 'Marko Stamenic',           club: 'Swansea City' },
    { number: 20, position: 'MF', name: 'Ryan Thomas',              club: 'PEC Zwolle' },
    // FW
    { number: 21, position: 'FW', name: 'Kosta Barbarouses',        club: 'Western Sydney Wanderers' },
    { number: 22, position: 'FW', name: 'Eli Just',                 club: 'Motherwell' },
    { number: 23, position: 'FW', name: 'Callum McCowatt',          club: 'Silkeborg' },
    { number: 24, position: 'FW', name: 'Jesse Randall',            club: 'Auckland FC' },
    { number: 25, position: 'FW', name: 'Ben Waine',                club: 'Port Vale' },
    { number: 26, position: 'FW', name: 'Chris Wood',               club: 'Nottingham Forest' },
  ],

  // ─── Group H (4 队) ─────────────────────────────
  // Cabo Verde — 26 人
  'Cabo Verde': [
    // GK
    { number: 1,  position: 'GK', name: 'Carlos dos Santos',        club: 'San Diego' },
    { number: 2,  position: 'GK', name: 'Marcio Rosa',              club: 'Montana 1921' },
    { number: 3,  position: 'GK', name: 'Vozinha',                  club: 'Chaves' },
    // DF
    { number: 4,  position: 'DF', name: 'Sidny Cabral',             club: 'Benfica' },
    { number: 5,  position: 'DF', name: 'Diney Borges',             club: 'Al Bataeh' },
    { number: 6,  position: 'DF', name: 'Logan Costa',              club: 'Villarreal' },
    { number: 7,  position: 'DF', name: 'Roberto Lopes',            club: 'Shamrock Rovers' },
    { number: 8,  position: 'DF', name: 'Steven Moreira',           club: 'Columbus Crew' },
    { number: 9,  position: 'DF', name: 'Wagner Pina',              club: 'Trabzonspor' },
    { number: 10, position: 'DF', name: 'Kelvin Pires',             club: 'SJK Seinajoki' },
    { number: 11, position: 'DF', name: 'Stopira',                  club: 'Torreense' },
    // MF
    { number: 12, position: 'MF', name: 'Telmo Arcanjo',            club: 'Vitoria Guimaraes' },
    { number: 13, position: 'MF', name: 'Deroy Duarte',             club: 'Ludogorets' },
    { number: 14, position: 'MF', name: 'Laros Duarte',             club: 'Puskas Akademia' },
    { number: 15, position: 'MF', name: 'Joao Paulo Fernandes',     club: 'FCSB' },
    { number: 16, position: 'MF', name: 'Jamiro Monteiro',          club: 'PEC Zwolle' },
    { number: 17, position: 'MF', name: 'Kevin Pina',               club: 'FK Krasnodar' },
    { number: 18, position: 'MF', name: 'Yannick Semedo',           club: 'Farense' },
    // FW
    { number: 19, position: 'FW', name: 'Gilson Benchimol',         club: 'Akron Togliatti' },
    { number: 20, position: 'FW', name: 'Jovane Cabral',            club: 'Estrela da Amadora' },
    { number: 21, position: 'FW', name: 'Dailon Livramento',        club: 'Casa Pia' },
    { number: 22, position: 'FW', name: 'Ryan Mendes',              club: 'Igdir' },
    { number: 23, position: 'FW', name: 'Nuno da Costa',            club: 'Istanbul Basaksehir' },
    { number: 24, position: 'FW', name: 'Garry Rodrigues',          club: 'Apollon Limassol' },
    { number: 25, position: 'FW', name: 'Willy Semedo',             club: 'Omonia Nicosia' },
    { number: 26, position: 'FW', name: 'Helio Varela',             club: 'Maccabi Tel Aviv' },
  ],

  // Saudi Arabia — 26 人
  'Saudi Arabia': [
    // GK
    { number: 1,  position: 'GK', name: 'Nawaf Al-Aqidi',           club: 'Al-Nassr' },
    { number: 2,  position: 'GK', name: 'Ahmed Al-Kassar',          club: 'Al-Qadsiyah' },
    { number: 3,  position: 'GK', name: 'Mohammed Al-Owais',        club: 'Al-Ula' },
    // DF
    { number: 4,  position: 'DF', name: 'Saud Abdulhamid',          club: 'RC Lens' },
    { number: 5,  position: 'DF', name: 'Abdulelah Al-Amri',        club: 'Al-Nassr' },
    { number: 6,  position: 'DF', name: 'Moteb Al-Harbi',           club: 'Al-Hilal' },
    { number: 7,  position: 'DF', name: 'Mohammed Abu Al-Shamat',   club: 'Al-Qadisiyah' },
    { number: 8,  position: 'DF', name: 'Hassan Al-Tambakti',       club: 'Al-Hilal' },
    { number: 9,  position: 'DF', name: 'Nawaf Boushal',            club: 'Al-Nassr' },
    { number: 10, position: 'DF', name: 'Hassan Kadesh',            club: 'Al-Ittihad' },
    { number: 11, position: 'DF', name: 'Ali Lajami',               club: 'Al-Hilal' },
    { number: 12, position: 'DF', name: 'Ali Majrashi',             club: 'Al-Ahli' },
    { number: 13, position: 'DF', name: 'Jehad Thakri',             club: 'Al-Qadisiyah' },
    { number: 14, position: 'DF', name: 'Ayman Yahya',              club: 'Al-Nassr' },
    // MF
    { number: 15, position: 'MF', name: 'Nasser Al-Dawsari',        club: 'Al-Hilal' },
    { number: 16, position: 'MF', name: 'Alaa Al-Hajji',            club: 'NEOM' },
    { number: 17, position: 'MF', name: 'Abdullah Al-Khaibari',     club: 'Al-Nassr' },
    { number: 18, position: 'MF', name: 'Ziyad Al-Johani',          club: 'Al-Ahli' },
    { number: 19, position: 'MF', name: 'Musab Al-Juwayr',          club: 'Al-Qadisiyah' },
    { number: 20, position: 'MF', name: 'Abdullah Al-Kahibari',     club: 'Al-Nassr' },
    { number: 21, position: 'MF', name: 'Mohamed Kanno',            club: 'Al-Hilal' },
    { number: 22, position: 'MF', name: 'Sultan Mandash',           club: 'Al-Hilal' },
    // FW
    { number: 23, position: 'FW', name: 'Firas Al-Buraikan',        club: 'Al-Ahli' },
    { number: 24, position: 'FW', name: 'Salem Al-Dawsari',         club: 'Al-Hilal' },
    { number: 25, position: 'FW', name: 'Khalid Al-Ghannam',        club: 'Al-Ettifaq' },
    { number: 26, position: 'FW', name: 'Abdullah Al-Hamdan',       club: 'Al-Nassr' },
  ],

  // Spain — 26 人
  Spain: [
    // GK
    { number: 1,  position: 'GK', name: 'Unai Simon',               club: 'Athletic Bilbao' },
    { number: 2,  position: 'GK', name: 'David Raya',               club: 'Arsenal' },
    { number: 3,  position: 'GK', name: 'Joan Garcia',              club: 'Barcelona' },
    // DF
    { number: 4,  position: 'DF', name: 'Marcos Llorente',          club: 'Atletico Madrid' },
    { number: 5,  position: 'DF', name: 'Marc Pubill',              club: 'Atletico Madrid' },
    { number: 6,  position: 'DF', name: 'Pedro Porro',              club: 'Tottenham' },
    { number: 7,  position: 'DF', name: 'Aymeric Laporte',          club: 'Athletic Club' },
    { number: 8,  position: 'DF', name: 'Eric Garcia',              club: 'Barcelona' },
    { number: 9,  position: 'DF', name: 'Pau Cubarsi',              club: 'Barcelona' },
    { number: 10, position: 'DF', name: 'Marc Cucurella',           club: 'Chelsea' },
    { number: 11, position: 'DF', name: 'Alejandro Grimaldo',       club: 'Bayer Leverkusen' },
    // MF
    { number: 12, position: 'MF', name: 'Rodri',                    club: 'Manchester City' },
    { number: 13, position: 'MF', name: 'Martin Zubimendi',         club: 'Arsenal' },
    { number: 14, position: 'MF', name: 'Mikel Merino',             club: 'Arsenal' },
    { number: 15, position: 'MF', name: 'Pedri',                    club: 'Barcelona' },
    { number: 16, position: 'MF', name: 'Gavi',                     club: 'Barcelona' },
    { number: 17, position: 'MF', name: 'Fabian Ruiz',              club: 'Paris Saint-Germain' },
    { number: 18, position: 'MF', name: 'Alex Baena',               club: 'Atletico Madrid' },
    // FW
    { number: 19, position: 'FW', name: 'Yeremy Pino',              club: 'Crystal Palace' },
    { number: 20, position: 'FW', name: 'Victor Munoz',             club: 'Osasuna' },
    { number: 21, position: 'FW', name: 'Mikel Oyarzabal',          club: 'Real Sociedad' },
    { number: 22, position: 'FW', name: 'Ferran Torres',            club: 'Barcelona' },
    { number: 23, position: 'FW', name: 'Lamine Yamal',             club: 'Barcelona' },
    { number: 24, position: 'FW', name: 'Dani Olmo',                club: 'Barcelona' },
    { number: 25, position: 'FW', name: 'Nico Williams',            club: 'Athletic Club' },
    { number: 26, position: 'FW', name: 'Borja Iglesias',           club: 'Celta Vigo' },
  ],

  // Uruguay — 26 人
  Uruguay: [
    // GK
    { number: 1,  position: 'GK', name: 'Santiago Mele',            club: 'Monterrey' },
    { number: 2,  position: 'GK', name: 'Fernando Muslera',         club: 'Estudiantes' },
    { number: 3,  position: 'GK', name: 'Sergio Rochet',            club: 'Internacional' },
    // DF
    { number: 4,  position: 'DF', name: 'Ronald Araujo',            club: 'Barcelona' },
    { number: 5,  position: 'DF', name: 'Santiago Bueno',           club: 'Wolverhampton Wanderers' },
    { number: 6,  position: 'DF', name: 'Sebastian Caceres',        club: 'Club America' },
    { number: 7,  position: 'DF', name: 'Jose Maria Gimenez',       club: 'Atletico Madrid' },
    { number: 8,  position: 'DF', name: 'Mathias Olivera',          club: 'Napoli' },
    { number: 9,  position: 'DF', name: 'Joaquin Piquerez',         club: 'Palmeiras' },
    { number: 10, position: 'DF', name: 'Guillermo Varela',         club: 'Flamengo' },
    { number: 11, position: 'DF', name: 'Matias Vina',              club: 'River Plate' },
    // MF
    { number: 12, position: 'MF', name: 'Rodrigo Bentancur',        club: 'Tottenham Hotspur' },
    { number: 13, position: 'MF', name: 'Giorgian De Arrascaeta',   club: 'Flamengo' },
    { number: 14, position: 'MF', name: 'Nicolas De La Cruz',       club: 'Flamengo' },
    { number: 15, position: 'MF', name: 'Emiliano Martinez',        club: 'Palmeiras' },
    { number: 16, position: 'MF', name: 'Juan Manuel Sanabria',     club: 'Real Salt Lake' },
    { number: 17, position: 'MF', name: 'Manuel Ugarte',            club: 'Manchester United' },
    { number: 18, position: 'MF', name: 'Federico Valverde',        club: 'Real Madrid' },
    { number: 19, position: 'MF', name: 'Rodrigo Zalazar',          club: 'Sporting Braga' },
    // FW
    { number: 20, position: 'FW', name: 'Rodrigo Aguirre',          club: 'Tigres' },
    { number: 21, position: 'FW', name: 'Maximiliano Araujo',       club: 'Sporting CP' },
    { number: 22, position: 'FW', name: 'Agustin Canobbio',         club: 'Fluminense' },
    { number: 23, position: 'FW', name: 'Darwin Nunez',             club: 'Al-Hilal' },
    { number: 24, position: 'FW', name: 'Facundo Pellistri',        club: 'Panathinaikos' },
    { number: 25, position: 'FW', name: 'Brian Rodriguez',          club: 'Club America' },
    { number: 26, position: 'FW', name: 'Federico Vinas',           club: 'Real Oviedo' },
  ],

  // ─── Group I (4 队) ─────────────────────────────
  // France — 26 人
  France: [
    // GK
    { number: 1,  position: 'GK', name: 'Mike Maignan',             club: 'AC Milan' },
    { number: 2,  position: 'GK', name: 'Robin Risser',             club: 'Lens' },
    { number: 3,  position: 'GK', name: 'Brice Samba',              club: 'Rennes' },
    // DF
    { number: 4,  position: 'DF', name: 'Lucas Digne',              club: 'Aston Villa' },
    { number: 5,  position: 'DF', name: 'Malo Gusto',               club: 'Chelsea' },
    { number: 6,  position: 'DF', name: 'Lucas Hernandez',          club: 'PSG' },
    { number: 7,  position: 'DF', name: 'Theo Hernandez',           club: 'Al-Hilal' },
    { number: 8,  position: 'DF', name: 'Ibrahima Konate',          club: 'Liverpool' },
    { number: 9,  position: 'DF', name: 'Jules Kounde',             club: 'FC Barcelona' },
    { number: 10, position: 'DF', name: 'Maxence Lacroix',          club: 'Crystal Palace' },
    { number: 11, position: 'DF', name: 'William Saliba',           club: 'Arsenal' },
    { number: 12, position: 'DF', name: 'Dayot Upamecano',          club: 'Bayern' },
    // MF
    { number: 13, position: 'MF', name: "N'Golo Kante",             club: 'Fenerbahce' },
    { number: 14, position: 'MF', name: 'Manu Kone',                club: 'AS Roma' },
    { number: 15, position: 'MF', name: 'Adrien Rabiot',            club: 'AC Milan' },
    { number: 16, position: 'MF', name: 'Aurelien Tchouameni',      club: 'Real Madrid' },
    { number: 17, position: 'MF', name: 'Warren Zaire-Emery',       club: 'PSG' },
    // FW (Flashscore 标 Attackers, 跟 FW 同义)
    { number: 18, position: 'FW', name: 'Maghnes Akliouche',        club: 'Monaco' },
    { number: 19, position: 'FW', name: 'Bradley Barcola',          club: 'PSG' },
    { number: 20, position: 'FW', name: 'Rayan Cherki',             club: 'Manchester City' },
    { number: 21, position: 'FW', name: 'Ousmane Dembele',          club: 'PSG' },
    { number: 22, position: 'FW', name: 'Desire Doue',              club: 'PSG' },
    { number: 23, position: 'FW', name: 'Jean-Philippe Mateta',     club: 'Crystal Palace' },
    { number: 24, position: 'FW', name: 'Kylian Mbappe',            club: 'Real Madrid' },
    { number: 25, position: 'FW', name: 'Michael Olise',            club: 'Bayern' },
    { number: 26, position: 'FW', name: 'Marcus Thuram',            club: 'Inter' },
  ],

  // Iraq — 23 人 (差 3: TBD-24, TBD-25, TBD-26)
  Iraq: [
    // GK
    { number: 1,  position: 'GK', name: 'Ahmed Basil',              club: 'Al-Shorta' },
    { number: 2,  position: 'GK', name: 'Jalal Hassan',             club: 'Al-Zawraa' },
    { number: 3,  position: 'GK', name: 'Fahad Talib',              club: 'Al-Talaba' },
    // DF
    { number: 4,  position: 'DF', name: 'Hussein Ali',              club: 'Pogon Szczecin' },
    { number: 5,  position: 'DF', name: 'Merchas Doski',            club: 'Viktoria Plzen' },
    { number: 6,  position: 'DF', name: 'Akam Hashim',              club: 'Al-Zawraa' },
    { number: 7,  position: 'DF', name: 'Ahmed Maknzi',             club: 'Al-Karma' },
    { number: 8,  position: 'DF', name: 'Frans Putros',             club: 'Persib' },
    { number: 9,  position: 'DF', name: 'Mustafa Saadoon',          club: 'Al-Quwa' },
    { number: 10, position: 'DF', name: 'Rebin Sulaka',             club: 'Port' },
    { number: 11, position: 'DF', name: 'Zaid Tahseen',             club: 'Pakhtakor' },
    { number: 12, position: 'DF', name: 'Manaf Younis',             club: 'Al-Shorta' },
    // MF
    { number: 13, position: 'MF', name: 'Amir Al-Ammari',           club: 'Cracovia' },
    { number: 14, position: 'MF', name: 'Youssef Amyn',             club: 'AEK Larnaca' },
    { number: 15, position: 'MF', name: 'Ibrahim Bayesh',           club: 'Al-Dhafra' },
    { number: 16, position: 'MF', name: 'Marko Farji',              club: 'Venezia' },
    { number: 17, position: 'MF', name: 'Zidane Iqbal',             club: 'FC Utrecht' },
    { number: 18, position: 'MF', name: 'Zaid Ismail',              club: 'Al-Talaba' },
    { number: 19, position: 'MF', name: 'Ali Jassim',               club: 'Al-Najma' },
    { number: 20, position: 'MF', name: 'Aimar Sher',               club: 'Sarpsborg' },
    // FW
    { number: 21, position: 'FW', name: "Mohanad 'Meme' Ali",       club: 'Dibba' },
    { number: 22, position: 'FW', name: 'Ali Al-Hamadi',            club: 'Luton Town' },
    { number: 23, position: 'FW', name: 'Ahmed Qasem',              club: 'Nashville SC' },
    { number: 24, position: 'FW', name: 'TBD-24',                   club: 'TBD' },
    { number: 25, position: 'FW', name: 'TBD-25',                   club: 'TBD' },
    { number: 26, position: 'FW', name: 'TBD-26',                   club: 'TBD' },
  ],

  // Norway — 26 人
  Norway: [
    // GK
    { number: 1,  position: 'GK', name: 'Egil Selvik',              club: 'Watford' },
    { number: 2,  position: 'GK', name: 'Orjan Nyland',             club: 'Sevilla' },
    { number: 3,  position: 'GK', name: 'Sander Tangvik',           club: 'Hamburg' },
    // DF
    { number: 4,  position: 'DF', name: 'Kristoffer Ajer',          club: 'Brentford' },
    { number: 5,  position: 'DF', name: 'Fredrik Bjorkan',          club: 'Bodo/Glimt' },
    { number: 6,  position: 'DF', name: 'Henrik Falchener',         club: 'Viking FK' },
    { number: 7,  position: 'DF', name: 'Sondre Langas',            club: 'Derby County' },
    { number: 8,  position: 'DF', name: 'Torbjorn Heggem',          club: 'Bologna' },
    { number: 9,  position: 'DF', name: 'Marcus Pedersen',          club: 'Torino' },
    { number: 10, position: 'DF', name: 'Julian Ryerson',           club: 'Dortmund' },
    { number: 11, position: 'DF', name: 'David Moller Wolfe',       club: 'Wolves' },
    { number: 12, position: 'DF', name: 'Leo Ostigard',             club: 'Genoa' },
    // MF
    { number: 13, position: 'MF', name: 'Thelo Aasgaard',           club: 'Rangers' },
    { number: 14, position: 'MF', name: 'Fredrik Aursnes',          club: 'Benfica' },
    { number: 15, position: 'MF', name: 'Patrick Berg',             club: 'Bodo/Glimt' },
    { number: 16, position: 'MF', name: 'Sander Berge',             club: 'Fulham' },
    { number: 17, position: 'MF', name: 'Oscar Bobb',               club: 'Fulham' },
    { number: 18, position: 'MF', name: 'Jens Petter Hauge',        club: 'Bodo/Glimt' },
    { number: 19, position: 'MF', name: 'Antonio Nusa',             club: 'RB Leipzig' },
    { number: 20, position: 'MF', name: 'Andreas Schjelderup',      club: 'Benfica' },
    { number: 21, position: 'MF', name: 'Morten Thorsby',           club: 'Cremonese' },
    { number: 22, position: 'MF', name: 'Kristian Thorstvedt',      club: 'Sassuolo' },
    { number: 23, position: 'MF', name: 'Martin Odegaard',          club: 'Arsenal' },
    // FW
    { number: 24, position: 'FW', name: 'Erling Haaland',           club: 'Manchester City' },
    { number: 25, position: 'FW', name: 'Jorgen Strand Larsen',     club: 'Crystal Palace' },
    { number: 26, position: 'FW', name: 'Alexander Sorloth',        club: 'Atletico Madrid' },
  ],

  // Senegal — 26 人
  Senegal: [
    // GK
    { number: 1,  position: 'GK', name: 'Edouard Mendy',            club: 'Al Ahli' },
    { number: 2,  position: 'GK', name: 'Yehvann Diouf',            club: 'Nice' },
    { number: 3,  position: 'GK', name: 'Mory Diaw',                club: 'Le Havre' },
    // DF
    { number: 4,  position: 'DF', name: 'Krepin Diatta',            club: 'Monaco' },
    { number: 5,  position: 'DF', name: 'Antoine Mendy',            club: 'Nice' },
    { number: 6,  position: 'DF', name: 'Abdoulaye Seck',           club: 'Maccabi Haifa' },
    { number: 7,  position: 'DF', name: 'Kalidou Koulibaly',        club: 'Al Hilal' },
    { number: 8,  position: 'DF', name: 'Moussa Niakhate',          club: 'Lyon' },
    { number: 9,  position: 'DF', name: 'Mamadou Sarr',             club: 'Chelsea' },
    { number: 10, position: 'DF', name: 'El-Hadji Malick Diouf',    club: 'West Ham United' },
    { number: 11, position: 'DF', name: 'Ismail Jakobs',            club: 'Galatasaray' },
    // MF
    { number: 12, position: 'MF', name: 'Idrissa Gueye',            club: 'Everton' },
    { number: 13, position: 'MF', name: 'Habib Diarra',             club: 'Sunderland' },
    { number: 14, position: 'MF', name: 'Pape Matar Sarr',          club: 'Tottenham' },
    { number: 15, position: 'MF', name: 'Pape Gueye',               club: 'Villarreal' },
    { number: 16, position: 'MF', name: 'Lamine Camara',            club: 'Monaco' },
    { number: 17, position: 'MF', name: 'Pathe Ciss',               club: 'Rayo Vallecano' },
    { number: 18, position: 'MF', name: 'Bara Ndiaye',              club: 'Bayern Munich' },
    // FW
    { number: 19, position: 'FW', name: 'Sadio Mane',               club: 'Al Nassr' },
    { number: 20, position: 'FW', name: 'Bamba Dieng',              club: 'Lorient' },
    { number: 21, position: 'FW', name: 'Iliman Ndiaye',            club: 'Everton' },
    { number: 22, position: 'FW', name: 'Nicolas Jackson',          club: 'Bayern Munich' },
    { number: 23, position: 'FW', name: 'Assane Diao',              club: 'Como' },
    { number: 24, position: 'FW', name: 'Ibrahim Mbaye',            club: 'Paris St-Germain' },
    { number: 25, position: 'FW', name: 'Cherif Ndiaye',            club: 'Samsunspor' },
    { number: 26, position: 'FW', name: 'Ismaila Sarr',             club: 'Crystal Palace' },
  ],
};

export { SQUADS_G7G9 };
export default SQUADS_G7G9;
