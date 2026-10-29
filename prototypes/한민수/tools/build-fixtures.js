const fs = require('fs')
const path = require('path')

const dir = path.join(__dirname, '..', 'data')
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8')
const out = 'window.FIXTURES = ' + JSON.stringify({
  leads: read('leads.csv'),
  replies: read('replies.csv')
}, null, 2) + '\n'
fs.writeFileSync(path.join(dir, 'fixtures.js'), out)
console.log('wrote data/fixtures.js')
