export const DEFAULT_QUESTIONS = Object.freeze([
  {prompt:'Panic! An executive is standing behind you, watching you build an urgently needed dashboard. Who would you rather have watching?',choices:['Madam Elena','Tita Ambe']},
  {prompt:'Which curse would you choose?',choices:['Always reply-all','Always send with typos']},
  {prompt:'You get one coding superpower. Which do you choose?',choices:['Find any bug instantly','Write perfect documentation instantly']},
  {prompt:'Pick one!',choices:['RTO thrice a week but you get additional 500/day allowance','Forever WFH but your manager gets a ding whenever your status becomes \'away\'']},
  {prompt:'Would you rather...',choices:['Expose your browser history','Work chat history']},
].map(q=>Object.freeze({...q,choices:Object.freeze(q.choices)})));
