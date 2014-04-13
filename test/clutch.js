var cluster = require('cluster');
var Clutch  = require('../lib/Clutch');
var clutch, server;

var numWorkers = 4;
clutch = Clutch({
  numWorkers: numWorkers
});

/** Helpers **/
var killWorker = function() {
  var workers = cluster.workers;
  var keys = Object.keys(workers);
  process.kill(cluster.workers[keys[0]].process.pid, 'SIGKILL');
};

var testWorkerCount = function() {
  clutch.countWorkers().should.equal(numWorkers);
};
/***********/

if (cluster.isMaster) {

  before(function(done) {
    clutch.once('listening', done);
  });

  /**
   * This implicitly tests that all workers exit gracefully and
   * the master only quits after the workers do.
   *
   * If the tests run slow or time out there is probably an issue here.
   */
  after(function(done) {
    clutch.once('shutDown', done);
    clutch.shutDown();
  });

  describe('master', function(){
    it('has workers', function() {
      testWorkerCount();
    });

    describe('worker dies', function() {
      it('notices', function(done) {
        clutch.once('workerDied', function() { done(); });
        killWorker();
      });

      it('phoenix', function(done) {
        clutch.once('workerStarted', function() {
          testWorkerCount();
          done();
        });
        killWorker();
      });
    });
  });
}

/**
 * The worker tests aren't really tests per se.
 * Since this suite is run by mocha, forking new workers
 * creates new processes running this mocha suite.
 * So technically each worker is another instance of mocha running the suite.
 *
 * Therefore, this part is a method of getting mocha to keep
 * the processes alive while the master tests are running.
 */
if (cluster.isWorker) {
  server = require('http').createServer(function(req, res) {

  }).listen(5000);

  clutch.once('shutDown', process.exit);

  before(function(done) {});

  describe('worker', function() {
    it('keepalive', function(done) {});
  });
}
