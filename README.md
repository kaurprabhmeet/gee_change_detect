**Google Earth Engine: SAR-Flood Mapping Using a Change Detection Approach**

This project uses Synthetic Aperture Radar (SAR) Sentinel-1 imagery to generate a flood extent map through a change detection approach. The process compares satellite images before and after a flood event to identify the flooded areas. The script utilizes the Sentinel-1 SAR imagery in [Google Earth Engine].
This imagery processing methodology is adapted from guidance from the [UN-SPIDER Knowledge Portal](https://www.un-spider.org/advisory-support/recommended-practices/recommended-practice-flood-mapping/step-by-step).

---

## Overview

Sentinel-1 SAR (Synthetic Aperture Radar) imagery has the advantage of being immune to weather change and penetrating cloud cover. The change detection technique highlights areas where significant changes in radar reflectivity are observed, indicating flooded regions. The following steps outline the flood mapping process:

1. **Preprocessing** of Sentinel-1 images: This includes thermal noise removal, radiometric calibration, terrain correction, and speckle filtering.
2. **Change Detection**: For each date in the "During Flood" period, the difference between pre-flood and post-flood images is calculated.
3. **Flood Detection**: The difference image is thresholded to classify pixels as flooded or not.
4. **Flood Extent Export**: The flood extent is exported as a shapefile, providing the geographical boundaries of the flooded areas.

---

## Key Features and Functions

### 1. **Helper Functions**

- **`formatDate(date)`**: Converts a JavaScript `Date` object into a string in `YYYY-MM-DD` format.
- **`addDays(date, days)`**: Adds a specified number of days to a given date and returns the new date in `YYYY-MM-DD` format.
- **`dates(imgcol)`**: Extracts and formats the start and end dates from an image collection's metadata.

### 2. **Set Dates**
Defines the time period for the before- and during-flood images:
- **Before Flood**: `2023-06-30` to `2023-07-30`
- **During Flood**: `2024-06-30` to `2024-07-30`

### 3. **SAR Parameters**
Defines the SAR parameters for flood mapping:
- **Polarization**: Set to `"VH"` (Vertical transmit, Horizontal receive) for flood mapping.
- **Difference Threshold**: A threshold for the difference image, used to classify flooded areas. This value can be adjusted to minimize false positives or negatives.
- **Smoothing Radius**: Applies a smoothing function to reduce radar speckle in the images.

### 4. **Get Relevant Data**
Filters Sentinel-1 images based on the selected area of interest (AOI) and relevant metadata:
- **Image Collection**: Sentinel-1 GRD (Ground Range Detected) images.
- **Surface Water Mask**: Uses JRC Global Surface Water dataset to exclude perennial water bodies.
- **Digital Elevation Model (DEM)**: Adds terrain information to exclude steep areas from the flood detection.

### 5. **Preprocessing the 'Before' Imagery**
- Filters the collection by date and orbit direction (Ascending/Descending).
- Applies a median reduction to merge multiple images and then applies smoothing to reduce speckle noise.

### 6. **Otsu Threshold Function**
- **`otsuThresholdForDifference(image, region)`**: Automatically calculates an optimal threshold using the Otsu method, based on the histogram of the difference image.

### 7. **Get and Process the Sentinel-1 Imagery**
- Filters the Sentinel-1 imagery for the "During Flood" time period.
- Processes both ascending and descending orbit images to detect flooded areas by comparing them with the pre-flood imagery.

### 8. **Flood Detection and Classification**
- For each date in the "During Flood" period, the difference between pre-flood and post-flood images is calculated.
- The difference image is thresholded using the Otsu method to identify flooded areas.
- We ensure detection mask excludes areas of perennial water bodies, steep terrain, and unconnected pixels.
  
### 9. **Export Flood Extent as Shapefile**
- The final flood extent polygons are exported as a shapefile.

### 10. **Zonal Statistics and Batch Processing**
- **`zonalStatsFlood(image, fc, params)`**: - Uses household GPS points to calculate the flood status for each household.

---

## Code Flow

1. **Set Dates**: Predefined start and end dates for before- and during-flood periods.
2. **Get Relevant Data**: Fetch Sentinel-1 imagery for the specified dates, filters by polarization, resolution, and geographical area.
3. **Process Before and During Flood Images**:
   - Apply median reduction to the image collections for both before- and during-flood imagery.
   - Apply smoothing and thresholding to detect flood areas.
4. **Flood Detection**: Calculate the difference between before- and during-flood images and apply Otsu thresholding to classify flooded pixels.
5. **Export Results**: Export flood polygons as shapefiles for spatial analysis.
6. **Zonal Statistics**: Calculate and export zonal statistics for the flooded areas based on predefined points.
7. **Batch Processing**: Ensure processing of GPS points and export of results in batches.

---

This code is provided for educational and research purposes. Please cite the source if you use it for academic or commercial projects.

