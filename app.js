var express = require('express');
var app = express();
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var session = require('cookie-session');
var bodyParser = require('body-parser');
var crypto = require('crypto');
var fs = require('fs');
var http = app.http = require('http').Server(app);
var io = require('socket.io')(http);
var busboy = require('connect-busboy');


// Used to generate session keys
var generateKey = function () {
  var sha = crypto.createHash('sha256');
  sha.update(Math.random().toString());
  return sha.digest('hex');
};

var mostRecentImageData = null,
  mostRecentRawImagePath = null,
  UPLOADS_DIR = path.join(__dirname, '/public/uploads/'),
  GENERATED_IMAGE_PATH = path.join(UPLOADS_DIR + 'generatedMap.png');


app.use(busboy()); 

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// Not sure if this is needed, Chrome seems to grab the favicon just fine anyway
// Maybe for cross-browser support
app.use(favicon(__dirname + '/public/images/favicon.ico'));
app.use(logger('dev'));

// Needed to handle JSON posts, size limit of 50mb
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

// Cookie parsing needed for sessions
app.use(cookieParser());

// Consider all URLs under /public/ as static files, and return them raw.
app.use(express.static(path.join(__dirname, 'public')));

// Session framework
// not implemented
app.use(session({secret: generateKey()}));

// Routes
// TODO: Move interior logic somewhere else
app.get('/', function (req, res) {
  res.render('player', {dm: false, title: 'Dungeon Mapper'});
});

app.get('/dm', function (req, res) {
  /* console.log( req.headers ); */
  if( req.headers['host'] == 'localhost:3000' ){
    res.render('dm', {dm: true, title: 'Dungeon Mapper DM Console'});
  }
  else
  {
    res.sendStatus(403);
  }
});


app.get('/map', function (req, res) {
  res.sendFile(GENERATED_IMAGE_PATH);
});


app.get('/quit', function (req, res) {
  if( req.headers['host'] == 'localhost:3000' ){
    res.render('quit');
    setTimeout(function () {
      process.exit( );
    }, 1000);
        
  }
  else
  {
    res.sendStatus(403);
  }
});

app.get('/dm/map', function (req, res) {

  var mapSent = false;

  if( req.headers['host'] == 'localhost:3000' ){

    if (mostRecentRawImagePath) {
      res.sendFile(mostRecentRawImagePath);
      mapSent = true;
    } else {
      console.log(UPLOADS_DIR);
      // Look in the dir for a file named map.* and return the first one found
      // Because we are deleting the previous files on upload this logic is mostly useless now
      var files = fs.readdirSync(UPLOADS_DIR);
      files.filter(function(file) { 
        return file.indexOf('map.') > -1; 
      }).forEach(function(file) { 
        var filePath = path.join(UPLOADS_DIR + file);
        if (!mapSent) {
          mapSent = true;
          mostRecentRawImagePath = filePath;
          res.sendFile(mostRecentRawImagePath);
        }
      });
    }
  }
      
  if (!mapSent) {
    res.sendStatus(403);
  }
});


app.get('/dm/listmaps', function (req, res) {
  if( req.headers['host'] == 'localhost:3000' ){
    let fs = require('fs');
    let files = fs.readdirSync('./public/uploads');
    res.status(200).send(files.filter(el => el.match(/map[0-9]*\./g)));
  }else{
    res.sendStatus(403);
  }
});


app.post('/dm/map', function (req, res) {
  if( req.headers['host'] == 'localhost:3000' ){
    let imgPath = req.body.imgPath;
    if(!imgPath.match(/^map[0-9]*\.(?:gif|tiff|bmp|jpeg|png|jpg)/gi)) {
      // Malformed Path
      res.sendStatus(400);
    }else{
      fs.unlink('public/uploads/'+imgPath, (err) => {
        if (err){
          res.sendStatus(500);
          throw err;
        }else{
          console.log(imgPath+' was deleted');
          res.sendStatus(200);
        }
      });
    }
  }else{
    res.sendStatus(403);
  }
});

// For DM map uploads. These are the raw images without any fog of war. 
app.post('/upload', function (req, res) {
  if( req.headers['host'] == 'localhost:3000' )  {
    req.pipe(req.busboy);

    req.busboy.on('file', function (fieldname, file, filename) {
      let randomNumber = Math.floor(Math.random() * 100000);
      var fileExtension = filename.split('.').pop(),
        uploadedImageSavePath = path.join(UPLOADS_DIR + 'map' + randomNumber + '.' + fileExtension),
        fstream;
              
      deleteExistingMapFilesSync();
              
      fstream = fs.createWriteStream(uploadedImageSavePath);
          
      file.pipe(fstream);
      fstream.on('close', function () {
        console.log('map uploaded');
        mostRecentRawImagePath = uploadedImageSavePath;
        res.status(200).send({ imgPath: 'uploads/map' + randomNumber + '.' + fileExtension});
      });
      // should do something for a failure as well
    });
  }else{
    res.status(403).send();
  }

});

// For the DM sending out fogged maps to be distributed to players
app.post('/send', function (req, res) {
  if( req.headers['host'] == 'localhost:3000' ){
    var imageDataString = req.body.imageData;

    if (imageDataString) {
      var imageData = decodeBase64Image(imageDataString).data;
            
      fs.writeFile(GENERATED_IMAGE_PATH, imageData, function (err) {
        if(err) throw err;
        console.log('sent map saved');
      });
        
      // Cache the data for future requests
      mostRecentImageData = imageDataString;
            
      // ACK for DM
      res.json({
        'success': true,
        'responseText': 'Image successfully uploaded'
      });
            
      // Send the map update to players
      io.emit('map update', {
        'imageData': imageDataString
      });
    } else {
      res.json({
        'success': false,
        'responseText': 'Image not uploaded successfully'
      });
    }
  }
  else
  {
    res.sendStatus(403);
  }
});


// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function (err, req, res) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res) {
  console.log(err);
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

io.on('connection', function(socket) {
  console.log('a user connected');
      
  if (mostRecentImageData) {
    console.log('sending current map to newly connected user');
    socket.emit('map update', {
      'imageData': mostRecentImageData
    });
  }
      
  socket.on('disconnect', function() {
    console.log('a user disconnected'); 
  });
});

function decodeBase64Image(dataString) {
  var matches = dataString.match(/^data:([A-Za-z-+/]+);base64,(.+)$/),
    response = {};
  
  if (matches.length !== 3) {
    return new Error('Invalid input string');
  }
  
  response.type = matches[1];
  response.data = new Buffer(matches[2], 'base64');
  
  return response;
}

function deleteExistingMapFilesSync() {
  var files = fs.readdirSync(UPLOADS_DIR);
  files.filter(function(file) { 
    return file.indexOf('map.') > -1; 
  }).forEach(function(file) { 
    var filePath = path.join(UPLOADS_DIR + file);
    fs.unlinkSync(filePath);
  });
}

module.exports = app;
