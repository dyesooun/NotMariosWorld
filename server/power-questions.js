// Server-only answer keys. Never include answers in a room snapshot or public asset.
export const POWER_QUIZ_DURATION_MS = 10000;
export const POWER_QUESTIONS = Object.freeze([
  ['capital-france','What is the capital of France?',['Paris']],
  ['capital-japan','What is the capital of Japan?',['Tokyo']],
  ['capital-italy','What is the capital of Italy?',['Rome','Roma']],
  ['capital-spain','What is the capital of Spain?',['Madrid']],
  ['capital-australia','What is the capital of Australia?',['Canberra']],
  ['capital-philippines','What is the capital of the Philippines?',['Manila']],
  ['largest-ocean','What is the largest ocean on Earth?',['Pacific','Pacific Ocean','The Pacific','The Pacific Ocean']],
  ['egypt-continent','On which continent is Egypt mainly located?',['Africa']],
  ['brazil-continent','On which continent is Brazil located?',['South America']],
  ['eiffel-city','In which city is the Eiffel Tower?',['Paris']],
  ['pyramids-country','In which country are the Pyramids of Giza?',['Egypt']],
  ['great-wall','In which country is the Great Wall?',['China']],
  ['red-planet','Which planet is known as the Red Planet?',['Mars']],
  ['closest-sun','Which planet is closest to the Sun?',['Mercury']],
  ['largest-planet','What is the largest planet in our solar system?',['Jupiter']],
  ['earth-satellite','What is Earth’s natural satellite called?',['Moon','The Moon']],
  ['water-formula','What is the chemical formula for water?',['H2O']],
  ['breathing-gas','Which gas do humans need from the air to breathe?',['Oxygen','O2']],
  ['gold-symbol','What is the chemical symbol for gold?',['Au']],
  ['freezing-water','At how many degrees Celsius does pure water normally freeze?',['0','Zero','0 degrees','Zero degrees','0°C']],
  ['photosynthesis','What process do plants use to turn sunlight into food?',['Photosynthesis']],
  ['heart-organ','Which organ pumps blood around the human body?',['Heart','The heart']],
  ['octopus-arms','How many arms does an octopus have?',['8','Eight']],
  ['spider-legs','How many legs does a spider have?',['8','Eight']],
  ['insect-legs','How many legs does an insect have?',['6','Six']],
  ['tallest-animal','What is the tallest living land animal?',['Giraffe','A giraffe','The giraffe']],
  ['largest-mammal','What is the largest living mammal?',['Blue whale','The blue whale','A blue whale']],
  ['caterpillar','What flying insect does a caterpillar become?',['Butterfly','A butterfly','Moth','A moth']],
  ['triangle','How many sides does a triangle have?',['3','Three']],
  ['hexagon','How many sides does a hexagon have?',['6','Six']],
  ['right-angle','How many degrees are in a right angle?',['90','Ninety','90 degrees','Ninety degrees']],
  ['square-root','What is the positive square root of 81?',['9','Nine']],
  ['dozen','How many items make a dozen?',['12','Twelve']],
  ['century','How many years are in a century?',['100','One hundred','A hundred','100 years']],
  ['leap-year','How many days are in a leap year?',['366','366 days','Three hundred sixty-six','Three hundred and sixty-six']],
  ['minute','How many seconds are in one minute?',['60','Sixty','60 seconds']],
  ['hour','How many minutes are in one hour?',['60','Sixty','60 minutes']],
  ['week','How many days are in a week?',['7','Seven','7 days']],
  ['leap-month','Which month gets an extra day in a leap year?',['February','Feb']],
  ['romeo-juliet','Who wrote Romeo and Juliet?',['William Shakespeare','Shakespeare']],
  ['mona-lisa','Who painted the Mona Lisa?',['Leonardo da Vinci','Da Vinci','Leonardo']],
  ['harry-potter','What is the first name of the young wizard with the surname Potter?',['Harry']],
  ['sherlock','What is the surname of the detective Sherlock?',['Holmes']],
  ['piano-keys','Which keyboard instrument makes sound with strings struck by small hammers?',['Piano','A piano','The piano']],
  ['chess-king','Which chess piece must be protected from checkmate?',['King','The king']],
  ['chess-board','How many squares are on a standard chessboard?',['64','Sixty-four','Sixty four']],
  ['tennis','Which sport uses a scoring system of love, 15, 30, and 40?',['Tennis']],
  ['basketball','Which sport is played by shooting a ball through a raised hoop?',['Basketball']],
  ['honey','What sweet food do honeybees make?',['Honey']],
  ['guacamole','What fruit is the main ingredient in guacamole?',['Avocado','Avocados']],
  ['sushi-country','With which country is sushi traditionally associated?',['Japan']],
  ['coffee-beans','Which drink is made from roasted coffee beans?',['Coffee']],
].map(([id,prompt,answers])=>Object.freeze({id,prompt,answers:Object.freeze(answers)})));

export function normalizePowerAnswer(value) {
  return typeof value==='string'?value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('en-US'):'';
}
export function isCorrectPowerAnswer(question,answer) {
  const normalized=normalizePowerAnswer(answer);
  return !!normalized&&question.answers.some(alias=>normalizePowerAnswer(alias)===normalized);
}
export function choosePowerQuestion({random=Math.random,excludedIds=[]}={}) {
  const excluded=new Set(excludedIds),available=POWER_QUESTIONS.filter(q=>!excluded.has(q.id));
  const pool=available.length?available:POWER_QUESTIONS;
  return pool[Math.floor(Math.max(0,Math.min(.999999,Number(random())||0))*pool.length)];
}
