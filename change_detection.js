/*===========================================================================================
                       SAR-FLOOD MAPPING USING A CHANGE DETECTION APPROACH
  ===========================================================================================
  Within this script SAR Sentinel-1 is being used to generate a flood extent map. A change 
  detection approach was chosen, where a before- and after-flood event image will be compared. 
  Sentinel-1 GRD imagery is being used. Ground Range Detected imagery includes the following 
  preprocessing steps: Thermal-Noise Removal, Radiometric calibration, Terrain-correction 
  hence only a Speckle filter needs to be applied in the preprocessing.  
  ===========================================================================================
  
/*===========================================================================================
  HELPER METHODS
  ===========================================================================================*/


// https://stackoverflow.com/questions/23593052/format-javascript-date-as-yyyy-mm-dd
function formatDate(date) {
    var d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2) 
        month = '0' + month;
    if (day.length < 2) 
        day = '0' + day;

    return [year, month, day].join('-');
}

function addDays(date, days) {
  var result = new Date(date);
  result.setDate(result.getDate() + days);
  return formatDate(result); 
}

// Extract date from meta data
function dates(imgcol){
  var range = imgcol.reduceColumns(ee.Reducer.minMax(), ["system:time_start"]);
  var printed = ee.String('from ')
    .cat(ee.Date(range.get('min')).format('YYYY-MM-dd'))
    .cat(' to ')
    .cat(ee.Date(range.get('max')).format('YYYY-MM-dd'));
  return printed;
}

/*===========================================================================================
  SET DATES 
  ===========================================================================================*/

// Get dates from the same time last year, since it did not trigger according to the FFWC forecasts last year
var before_start= '2023-06-30';
var before_end='2023-07-30'; 

var during_start = '2024-06-30'
var during_end = '2024-07-30'

/*===========================================================================================
  SET SAR PARAMETERS (can be left default)
  ===========================================================================================*/

var polarization = "VH"; /*or 'VV' --> VH mostly is the prefered polarization for flood mapping.
                           

var difference_threshold = -20; /*threshodl to be applied on the difference image (after flood
                           - before flood). It has been chosen by trial and error. In case your
                           flood extent result shows many false-positive or negative signals, 
                           consider changing it! Set below using OtSu*/
var relative_orbit_asc = 114; 
var relative_orbit_desc = 150; 
                          /*Calculation source: 
                          https://forum.step.esa.int/t/sentinel-1-relative-orbit-from-filename/7042*/
                           
// Apply reduce the radar speckle by smoothing  
var smoothing_radius = 50;

/*===========================================================================================
  GET RELEVANT DATA
  ===========================================================================================*/

// rename selected geometry feature 
var aoi = ee.FeatureCollection(geometry);

// Load and filter Sentinel-1 GRD data by predefined parameters 
var collection= ee.ImageCollection('COPERNICUS/S1_GRD')
  .filter(ee.Filter.eq('instrumentMode','IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', polarization))
  .filter(ee.Filter.eq('resolution_meters',10))
  .filterBounds(aoi)
  .select(polarization)
  .map(function(image){return image.clip(aoi)}); 
  
// Include JRC layer on surface water seasonality to mask flood pixels from areas
// of "permanent" water (where there is water > 10 months of the year)
var swater = ee.Image('JRC/GSW1_0/GlobalSurfaceWater').select('seasonality');
var swater_mask = swater.gte(10).updateMask(swater.gte(10));

// Add in a digital elevation model 
var DEM = ee.Image('WWF/HydroSHEDS/03VFDEM');
var terrain = ee.Algorithms.Terrain(DEM);
var slope = terrain.select('slope');

/*===========================================================================================
  GET AND PROCESS THE 'BEFORE' IMAGERY
  ===========================================================================================*/

// ---------- Before Ascending
var before_collection_asc = collection.filterDate(before_start, before_end)
  .filter(ee.Filter.eq('orbitProperties_pass', "ASCENDING"))
  .filter(ee.Filter.eq('relativeOrbitNumber_start',relative_orbit_asc)); 
var before_med_asc = ee.Image(before_collection_asc.reduce(ee.Reducer.median()));


var before_count_asc = before_collection_asc.size();
print(ee.String('Tiles selected: Before Flood ASC').cat('(').cat(before_count_asc).cat(')'),
  dates(before_collection_asc), before_collection_asc);

var before_filtered_asc = before_med_asc.focal_mean(smoothing_radius, 'circle', 'meters');

// ---------- Before Descending
var before_collection_desc = collection.filterDate(before_start, before_end)
.filter(ee.Filter.eq('orbitProperties_pass', "DESCENDING"))
.filter(ee.Filter.eq('relativeOrbitNumber_start',relative_orbit_desc)); 
var before_med_desc = ee.Image(before_collection_desc.reduce(ee.Reducer.median()));

var before_count_desc = before_collection_desc.size();
print(ee.String('Tiles selected: Before Flood DESC').cat('(').cat(before_count_desc).cat(')'),
  dates(before_collection_desc), before_collection_desc);

var before_filtered_desc = before_med_desc.focal_mean(smoothing_radius, 'circle', 'meters');

// --------- Display Layers
Map.centerObject(aoi,8);
//Map.addLayer(before_filtered_desc, {min:-25,max:0}, 'Before Des',0);
//Map.addLayer(before_filtered_asc, {min:-25,max:0}, 'Before Asc',0);


/*===========================================================================================
 OTSU Function 
  ===========================================================================================*/

var otsuThresholdForDifference = function(image, region) {
  // Compute the histogram of the difference image
  var histogram = image.reduceRegion({
    reducer: ee.Reducer.histogram(),
    geometry: region,
    scale: 10,
    maxPixels: 1e13
  });

  // Extract the band name (assumes single-band image)
  var bandName = image.bandNames().get(0);
  var hist = histogram.get(bandName);

  // Ensure histogram data is valid
  if (!hist) {
    print('No histogram available for the provided image and region.');
    return null;
  }

  // Calculate the Otsu threshold
  var otsu = function(histogram) {
    var counts = ee.Array(ee.Dictionary(histogram).get('histogram'));
    var means = ee.Array(ee.Dictionary(histogram).get('bucketMeans'));
    var total = counts.reduce(ee.Reducer.sum(), [0]).get([0]);
    var sum = means.multiply(counts).reduce(ee.Reducer.sum(), [0]).get([0]);
    var mean = sum.divide(total);

    var indices = ee.List.sequence(1, counts.length().get([0]));
    var bss = indices.map(function(i) {
      var aCounts = counts.slice(0, 0, i);
      var aMean = means.slice(0, 0, i).multiply(aCounts)
        .reduce(ee.Reducer.sum(), [0]).get([0])
        .divide(aCounts.reduce(ee.Reducer.sum(), [0]).get([0]));
      var bMean = sum.subtract(aCounts.multiply(aMean))
        .divide(total.subtract(aCounts.reduce(ee.Reducer.sum(), [0]).get([0])));
      var bssA = aCounts.reduce(ee.Reducer.sum(), [0])
        .get([0]).multiply(aMean.subtract(mean).pow(2));
      var bssB = total.subtract(aCounts.reduce(ee.Reducer.sum(), [0]).get([0]))
        .multiply(bMean.subtract(mean).pow(2));
      return bssA.add(bssB);
    });

    return means.sort(bss).get([-1]);
  };

  return ee.Number(otsu(hist));
};


/*===========================================================================================
  GET THE SENTINEL-1 IMAGERY FROM THE TIME PERIOD OF INTEREST
  ===========================================================================================*/

var collection_asc = collection.filterDate(during_start, during_end)
  .filter(ee.Filter.eq('orbitProperties_pass', "ASCENDING"))
  .filter(ee.Filter.eq('relativeOrbitNumber_start',relative_orbit_asc)); 
  
var start_asc = collection_asc
  .map(function(image) {
    return ee.Feature(null, {'date': image.date().format('YYYY-MM-dd')})
  })
  .distinct('date')
  .aggregate_array('date')
  .getInfo()

var collection_desc = collection.filterDate(during_start, during_end)
  .filter(ee.Filter.eq('orbitProperties_pass', "DESCENDING"))
  .filter(ee.Filter.eq('relativeOrbitNumber_start',relative_orbit_desc)); 

var start_desc = collection_desc
    .map(function(image) {
      return ee.Feature(null, {'date': image.date().format('YYYY-MM-dd')})
    })
    .distinct('date')
    .aggregate_array('date')
    .getInfo()

/*===========================================================================================
  GET AND PROCESS THE ASCENDING IMAGES
  ===========================================================================================*/
function processImagesWithReturn(dates, direction, before_filtered, relative_orbit) {
  var floodedImages = [];

  // Loop through all dates
  for (var i = 0; i < dates.length; i++) {
    // After collection
    var after_collection = collection.filterDate(dates[i], addDays(dates[i], 1))
      .filter(ee.Filter.eq('orbitProperties_pass', direction))
      .filter(ee.Filter.eq('relativeOrbitNumber_start', relative_orbit));
    
    // Print the dates to the console
    var after_count = after_collection.size(); 
    
    after_count.evaluate(function(count) {
      print('Selected tiles: (' + count + ')');
    });
      
    // Create a mosaic of selected tiles and clip to study area     
    var after = after_collection.mosaic();
    
    // Apply reduce the radar speckle by smoothing
    var after_filtered = after.focal_mean(smoothing_radius, 'circle', 'meters');
    
    // Calculate the difference between the before and after images
    var difference = after_filtered.divide(before_filtered);
    
 var otsuThreshold = otsuThresholdForDifference(difference, aoi);
  print('Otsu Threshold for ' + ':', otsuThreshold);
  
    // Apply the threshold to classify flooded areas
    var difference_binary = difference.gt(otsuThreshold);
    
    // Apply the predefined difference-threshold and create the flood extent mask 
    //var difference_binary = difference.gt(difference_threshold); 
    
    // Flooded layer where perennial water bodies (water > 10 mo/yr) is assigned a 0 value
    var flooded_mask = difference_binary.where(swater_mask, 0);
    
    // Final flooded area without pixels in perennial waterbodies
    var flooded = flooded_mask.updateMask(flooded_mask);

    // Compute connectivity of pixels to eliminate those connected to 8 or fewer neighbours
    var connections = flooded.connectedPixelCount();
    flooded = flooded.updateMask(connections.gte(8));
    
    // Mask out areas with more than 5 percent slope using a Digital Elevation Model 
    flooded = flooded.updateMask(slope.lt(10));

   // Ensure all masked values are set to 0
    flooded = flooded.unmask(0);
    
    // Store the flooded image
    floodedImages.push({
      date: dates[i],
      direction: direction,
      image: flooded
    });

    // Export flood polygons as shape-file
    var flooded_v = flooded.reduceToVectors({
      scale: 10,
      geometryType: 'polygon',
      geometry: aoi,
      eightConnected: false,
      bestEffort: true,
      tileScale: 2,
    });
    
    Export.table.toDrive({
      collection: flooded_v,
      description: 'Flood_extent_vector',
      fileFormat: 'SHP',
      fileNamePrefix: 'BGD_Floods-' + dates[i] + '-S1-' + direction
    });
  }
  
  return floodedImages;
}


/*===========================================================================================
  ZONAL STATS AND EXPORT FUNCTIONS
  ===========================================================================================*/

// Function to calculate and export zonal statistics for flooded area
function zonalStatsFlood(image, fc, params) {
  var _params = {
    reducer: ee.Reducer.mean(),
    scale: 10,  // Sentinel-1 resolution
    crs: null,
    bands: null,
    bandsRename: null,
  };

  if (params) {
    for (var param in params) {
      _params[param] = params[param] || _params[param];
    }
  }

  if (!_params.bands) _params.bands = image.bandNames();
  if (!_params.bandsRename) _params.bandsRename = _params.bands;

  var img = ee.Image(image.select(_params.bands, _params.bandsRename));

  var results = img.reduceRegions({
    collection: fc,
    reducer: _params.reducer,
    scale: _params.scale,
    crs: _params.crs
  });

  return results;
}

// Function to buffer points
function bufferPoints(radius, bounds) {
  return function(pt) {
    pt = ee.Feature(pt);
    return bounds ? pt.buffer(radius).bounds() : pt.buffer(radius);
  };
}

// Function to process and export a batch of points for flood analysis
function processAndExportFloodBatch(points, flooded, startIndex, batchSize, batchNumber) {
  var pointsBatch = points.toList(batchSize, startIndex);
  var batchFC = ee.FeatureCollection(pointsBatch);

  // Buffer points for analysis
  var ptsBuffered = batchFC.map(bufferPoints(15, true));

  // Parameters for flood analysis
  var params = {
    reducer: ee.Reducer.mean(),
    scale: 10,
    crs: 'EPSG:4326',
    bands: ['VH'],  // Adjust as per your flood raster band name
    bandsRename: ['flood_status']
  };

  // Calculate statistics
  var results = zonalStatsFlood(flooded, ptsBuffered, params);

  // Add batch metadata to results
  results = results.map(function(feature) {
    return feature.set({
      'batch_number': batchNumber,
      'analysis_date': ee.Date(Date.now()).format('YYYY-MM-dd')
    });
  });

  // Export the results to Google Drive
  Export.table.toDrive({
    collection: results,
    description: 'flood_analysis_batch_' + batchNumber,
    fileFormat: 'CSV',
    folder: 'sentinel1_.08' + allFloodedImages[j].date
  });

  return results;
}

// Ensure GPS points are loaded
var gpsPoints;
if (typeof gps !== 'undefined') {
  gpsPoints = ee.FeatureCollection(gps);
} else {
  gpsPoints = ee.FeatureCollection([]);
  print('Warning: No GPS points were loaded');
}

// Process images for both ascending and descending passes
var floodedImagesAsc = processImagesWithReturn(start_asc, 'ASCENDING', before_filtered_asc, relative_orbit_asc);
var floodedImagesDesc = processImagesWithReturn(start_desc, 'DESCENDING', before_filtered_desc, relative_orbit_desc);

// Calculate total number of points
var totalPoints = gpsPoints.size();
print('Total points:', totalPoints);

// Process in batches of 1000
var batchSize = 1000;
var numberOfBatches = ee.Number(totalPoints).divide(batchSize).ceil();
print('Number of batches needed:', numberOfBatches);

// Combine flood images from both passes
var allFloodedImages = floodedImagesAsc.concat(floodedImagesDesc);

// Create and export batches for all flood images
for (var j = 0; j < allFloodedImages.length; j++) {
  for (var i = 0; i < 104; i++) {  // Process first 104 batches 
    var startIndex = i * batchSize;
    
    // Process batch for each flood image
    var batchResults = processAndExportFloodBatch(
      gpsPoints, 
      allFloodedImages[j].image, 
      startIndex, 
      batchSize, 
      i + 1
    );
    
    // Print batch information
    print('Submitted batch ' + (i + 1) + ' for processing');
    print('Points ' + startIndex + ' to ' + (startIndex + batchSize - 1));
    print('Flood date: ' + allFloodedImages[j].date + ', Direction: ' + allFloodedImages[j].direction);
  }
}

print('All batches have been submitted for processing');

