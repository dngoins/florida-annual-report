/**
 * Routes Aggregator
 * 
 * Exports all route modules for easy importing and registration.
 * 
 * @module routes
 */

const health = require('./health');
const documents = require('./documents');
const extract = require('./extract');
const company = require('./company');
const reconcile = require('./reconcile');
const submit = require('./submit');
const audit = require('./audit');

module.exports = {
  health,
  documents,
  extract,
  company,
  reconcile,
  submit,
  audit
};
