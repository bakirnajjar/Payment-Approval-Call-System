const { readdirSync } = require('node:fs')
const { join } = require('node:path')
const { execFileSync } = require('node:child_process')

const backend = join(__dirname, '..', 'backend')
const services = join(backend, 'services')
const files = [
  join(backend, 'server.js'),
  ...readdirSync(services)
    .filter((file) => file.endsWith('.js'))
    .map((file) => join(services, file)),
]

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' })
}
