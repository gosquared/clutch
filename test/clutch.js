var cluster = require('cluster');
var Clutch = require('../lib/Clutch');
var clutch, server;

var numWorkers = 4;
clutch = Clutch({
  numWorkers: numWorkers
});

if (cluster.isMaster) {

  before(function(done) {
    clutch.once('listening', done);
  });

  after(function(done) {
    clutch.once('shutDown', done);
    clutch.shutDown();
  });

  describe('master', function(){
    it('has workers', function() {
      clutch.countWorkers().should.equal(numWorkers);
    });
  });
}

if (cluster.isWorker) {
  server = require('http').createServer(function(req, res) {

  }).listen(5000);

  clutch.once('shutDown', process.exit);

  before(function(done) {});

  describe('worker', function() {
    it('keepalive', function(done) {});
  });
}
