// Pip for Zapier. Built with the Zapier Platform CLI (zapier-platform-core 19). Prepared, NOT submitted: publishing
// a listing is Brayden's decision (see README.md).
const authentication = require('./authentication');
const startJob = require('./creates/start_job');
const teammateUpdate = require('./triggers/teammate_update');

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,
  authentication,
  triggers: { [teammateUpdate.key]: teammateUpdate },
  creates: { [startJob.key]: startJob },
};
