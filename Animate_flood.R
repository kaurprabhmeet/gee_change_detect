library(tmap)
library(sf)
library(dplyr)
library(gifski)

data_dir <- Sys.getenv("Bangladesh_flooding")
bgd_dir <- paste0(data_dir, '/explore')

shp_adm <- st_read(paste0(bgd_dir, '/ADM_Shp/bgd_admbnda_adm4_bbs_20201113.shp'))
shp_river <- st_read(paste0(bgd_dir, '/ADM_Shp/river_extent.shp'))
df_fs <- read.csv(paste0(bgd_dir,'/flood_extent/Flood_extent_vector.csv'))

shp_fs <- shp_adm %>%
  select(ADM4_PCODE, geometry)%>%
  right_join(df_fs, by='ADM4_PCODE')
  

map <- tm_shape(shp_fs) + tm_fill(col='flooded_fraction', palette = 'GnBu', title='Flooded fraction')+
  tm_facets(along='date')+
  tm_scale_bar()+
  tm_shape(shp_river) + tm_fill(col='#67a2c2')+
  tm_layout(frame=FALSE,
            panel.label.bg.color = '#ffffff',
            panel.label.color = 'black')

tmap_animation(map, 'flood_time_series.gif', delay=75)


