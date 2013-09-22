var cluster = require('cluster');
var Clutch = require('../lib/Clutch');
var clutch;
var numWorkers = 4;
before(function(){
  clutch = Clutch({
    numWorkers: numWorkers
  });
});

after(function(){
  clutch.shutDown();
});

var setupTests = function(){

  describe('clutch', function(){
    it('sets up workers', function(){
      clutch.countWorkers().should.equal(numWorkers);
    });
  });
};

if(cluster.isMaster) setupTests();
