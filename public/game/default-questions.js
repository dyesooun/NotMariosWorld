export const DEFAULT_QUESTIONS = Object.freeze([
  {prompt:'Panic! An executive is standing behind you, watching you build an urgently needed dashboard. Who would you rather have watching?',choices:['Madam Elena','Tita Ambe']},
  {prompt:'One will be erased from existence. Which would you choose to keep?',choices:['Pillows','Blankets']},
  {prompt:'You get one coding superpower. Which do you choose?',choices:['Find any bug instantly','Write perfect documentation instantly']},
  {prompt:'Your next team day includes one free perk. Which do you pick?',choices:['Unlimited coffee and tea','Unlimited snacks']},
  {prompt:'Your code works on the first try. What do you do?',choices:['Celebrate immediately','Check what else I broke']},
].map(q=>Object.freeze({...q,choices:Object.freeze(q.choices)})));
