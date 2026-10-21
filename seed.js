// Birinchi ishga tushirishda yaratiladigan namunaviy viktorinalar
const TF = ['Toʻgʻri', 'Notoʻgʻri'];
const mc = (text, options, correct, time = 20, extra = {}) => ({ type: 'multiple', text, image: '', options, correct: [correct], time, points: 1, ...extra });
const tf = (text, isTrue, time = 10) => ({ type: 'truefalse', text, image: '', options: TF, correct: [isTrue ? 0 : 1], time, points: 1 });

module.exports = [
  {
    id: 'uzbekiston',
    title: 'Oʻzbekiston: tarix va geografiya',
    description: 'Vatanimiz haqida qanchalik koʻp bilasiz?',
    updatedAt: Date.now(),
    questions: [
      mc('Oʻzbekistonning poytaxti qaysi shahar?', ['Samarqand', 'Toshkent', 'Buxoro', 'Xiva'], 1, 10),
      mc('Oʻzbekiston Mustaqillik kuni qachon nishonlanadi?', ['21-mart', '8-dekabr', '1-sentabr', '9-may'], 2),
      mc('Amir Temur qayerda tavallud topgan?', ['Samarqand', 'Termiz', 'Buxoro', 'Shahrisabz (Kesh)'], 3),
      mc('Oʻzbekistonda nechta viloyat bor?', ['10', '12', '13', '14'], 1),
      mc('Mirzo Ulugʻbek rasadxonasi qaysi shaharda joylashgan?', ['Samarqand', 'Toshkent', 'Qoʻqon', 'Namangan'], 0),
      tf('Oʻzbekiston dunyodagi ikki davlatdan biri — dengizga chiqish uchun ikki davlatni kesib oʻtish kerak.', true, 20),
      mc('“Xamsa” asarining muallifi kim?', ['Bobur', 'Alisher Navoiy', 'Ogahiy', 'Furqat'], 1),
      mc('“Oʻtkan kunlar” romanini kim yozgan?', ['Choʻlpon', 'Gʻafur Gʻulom', 'Abdulla Qodiriy', 'Oybek'], 2),
      mc('Oʻzbekistonning milliy valyutasi qanday ataladi?', ['Tenge', 'Soʻm', 'Manat', 'Somoni'], 1, 10, { points: 2 }),
    ],
  },
  {
    id: 'matematika',
    title: 'Matematika — tezkor hisob',
    description: 'Tez oʻylang, tez javob bering!',
    updatedAt: Date.now() - 1000,
    questions: [
      mc('7 × 8 = ?', ['54', '56', '64', '48'], 1, 10),
      mc('144 ning kvadrat ildizi nechaga teng?', ['11', '14', '12', '16'], 2, 10),
      mc('200 ning 15 foizi qancha?', ['30', '15', '20', '35'], 0),
      mc('Uchburchak ichki burchaklarining yigʻindisi necha gradus?', ['90°', '360°', '270°', '180°'], 3),
      tf('0 — tub son.', false),
      mc('2¹⁰ = ?', ['512', '1000', '1024', '2048'], 2),
      mc('Eng kichik tub son qaysi?', ['0', '1', '2', '3'], 2, 10),
      mc('3/4 + 1/4 = ?', ['1', '4/8', '1/2', '3/16'], 0, 10),
    ],
  },
  {
    id: 'tabiat',
    title: 'Tabiat va fan',
    description: 'Fizika, kimyo, biologiya va astronomiya',
    updatedAt: Date.now() - 2000,
    questions: [
      mc('Suvning kimyoviy formulasi qanday?', ['CO₂', 'H₂O', 'O₂', 'NaCl'], 1, 10),
      mc('Quyosh tizimidagi eng katta sayyora qaysi?', ['Saturn', 'Yer', 'Yupiter', 'Neptun'], 2),
      mc('Katta yoshli inson tanasida nechta suyak bor?', ['206', '180', '256', '300'], 0),
      tf('Oy oʻzidan nur taratadi.', false),
      mc('Yorugʻlikning vakuumdagi tezligi taxminan qancha?', ['30 000 km/s', '300 km/s', '3 000 000 km/s', '300 000 km/s'], 3, 30),
    ],
  },
];
