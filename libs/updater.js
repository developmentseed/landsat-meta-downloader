'use strict';

var fs = require('fs-extra');
var join = require('path').join;
var request = require('request');
var progress = require('request-progress');
var async = require('async');
var es = require('./es/updater.js');
var mongoUpdater = require('./mongo/updater.js');

var Updater = function (esIndex, esType, bulkSize, downloadFolder) {
  // Globals
  this.url = 'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_8_C1.csv';
  this.downloadFolder = downloadFolder || join(__dirname, 'download');
  this.csvFile = join(this.downloadFolder, 'landsat.csv');
  this.esIndex = esIndex;
  this.esType = esType;
  this.bulkSize = bulkSize;
};

// Downloads the url to the given path
var downloadCsv = function (url, path, callback) {
  progress(request(url), {
    delay: 1000      // Only start to emit after 1000ms delay
  })
  .on('progress', function (state) {
    var size = Math.floor(state.received / Math.pow(1024, 2)).toFixed(2);
    process.stdout.write('Received size:              ' + size + 'MB \r');
  })
  .once('error', function (err) {
    callback(err);
  })
  .once('end', function () {
    console.log('\n Download Completed!');
    callback(null);
  })
  .pipe(fs.createWriteStream(path));
};

Updater.prototype.download = function (cb) {
  var self = this;

  async.waterfall([
    // Create download directory
    function (callback) {
      fs.mkdirsSync(self.downloadFolder);
      callback(null);
    },
    // Check when was the last time the file was downloaded
    function (callback) {
      fs.stat(self.csvFile, function (err, stats) {
        if (err) {
          if (err.code !== 'ENOENT') {
            callback(err);
          } else {
            stats = {mtime: '2010-01-01'};
          }
        }
        callback(null, stats);
      });
    },
    // // Download the file
    function (stats, callback) {
      var elapsed = (Date.now() - Date.parse(stats.mtime)) / 1000 / 60 / 60;
      if (elapsed < 12) {
        console.log('Meta file was downloaded less than 12 hours ago!');
        callback(null);
      } else {
        downloadCsv(self.url, self.csvFile, callback);
      }
    }
  ], function (err, result) {
    cb(err, result);
  });
};

Updater.prototype.updateEs = function (cb) {
  console.log('Downloading landsat.csv from NASA ...');

  var self = this;

  async.waterfall([
    // Download landsat
    function (callback) {
      self.download(callback);
    },

    // Add new records to ES
    function (result, callback) {
      es.toElasticSearch(
        self.csvFile,
        self.esIndex,
        self.esType,
        self.bulkSize,
        callback
      );
    }

  // final step
  ], function (err, msg) {
    cb(err, msg);
  });
};

Updater.prototype.updateMongoDb = function (dbURL, cb) {
  console.log('Downloading landsat.csv from NASA ...');

  var self = this;

  async.waterfall([
    // Download landsat meta csv file
    function (callback) {
      self.download(callback);
    },

    // Add new records to MongoDB
    function (resutl, callback) {
      console.log();
      mongoUpdater.toMongoDb(self.csvFile, self.bulkSize, callback);
    }
  ], function (err, result) {
    cb(err, result);
  });
};

module.exports = Updater;
