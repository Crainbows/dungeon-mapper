#!/usr/bin/env node
var app = require('../app');
var http = app.http;
var os = require('os');
var ifaces = os.networkInterfaces();

app.set('port', process.env.PORT || 3000);

var server = http.listen(app.get('port'), function() {

  const port = server.address().port,
    //message = 'Listening at ' + host + ':' + port;
    message = 'Listening at http://localhost:' + port;
  
  console.log(message);

  console.log('Point your browser to that address');
      
  // This code borrowed from a SO answer
  Object.keys(ifaces).forEach(function(ifname) {
    var alias = 0;
      
    ifaces[ifname].forEach(function(iface) {
      if ('IPv4' !== iface.family || iface.internal !== false) {
        // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
        return;
      }
      
      if (alias >= 1) {
        // this single interface has multiple ipv4 addresses
        //console.log(ifname + ':' + alias, iface.address);
      } else {
        // this interface has only one ipv4 adress
        console.log('Have your players point their browsers to http://' + iface.address + ':' + port);
      }
    });
  });
      
});
