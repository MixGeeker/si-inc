"""Build the browser map from public geographic data. Run with Python, Pillow and NumPy."""
import argparse
import csv
import math
import re
import shutil
import struct
import urllib.request
import zipfile
from xml.etree import ElementTree
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from xml.sax.saxutils import quoteattr

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageOps

OUT = Path(__file__).resolve().parents[1] / "apps/web/src/cartography/data"
PSL = "https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis/Monthlies/pressure/"
GDP = "https://erddap.aoml.noaa.gov/gdp/erddap/griddap/drifter_monthlymeans.csv?"
TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/3/"
WIDTH, HEIGHT = 4096, 2048


def sources(cache):
    urls = {
        "ne1.zip": "https://naturalearth.s3.amazonaws.com/50m_raster/NE1_50M_SR.zip",
        "blue-marble.jpg": "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography/november/world.topo.200411.3x5400x2700.jpg",
        "night-lights.jpg": "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144897/BlackMarble_2016_3km_gray.jpg",
        "kyiv.jpg": "https://upload.wikimedia.org/wikipedia/commons/3/30/Kiev_Opera_House.JPG",
        "boundaries.zip": "https://naturalearth.s3.amazonaws.com/50m_cultural/ne_50m_admin_0_countries.zip",
        "ne_10m_admin_0_disputed_areas.zip": "https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_0_disputed_areas.zip",
        "currents.csv": GDP + "U[10][0:4:1439][0:4:631],V[10][0:4:1439][0:4:631]",
    }
    for v in ("uwnd", "vwnd", "rhum"):
        urls[v + "850.txt"] = PSL + f"{v}.mon.ltm.1991-2020.nc.ascii?{v}[10][2][0:1:72][0:1:143]"
    for x in range(8):
        for y in range(8):
            urls[f"terrain-3-{x}-{y}.png"] = TILES + f"{x}/{y}.png"

    def fetch(entry):
        name, url = entry
        target = cache / name
        if not target.exists():
            part = target.with_suffix(".part")
            with urllib.request.urlopen(url, timeout=90) as source, part.open("wb") as out:
                shutil.copyfileobj(source, out)
            part.replace(target)

    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(fetch, urls.items()))


def dbf_rows(data):
    count, header, length = struct.unpack_from("<IHH", data, 4)
    fields = []
    for i in range(32, header - 1, 32):
        name = data[i:i + 11].split(b"\0")[0].decode()
        fields.append((name, data[i + 16]))
    for i in range(count):
        pos = header + i * length + 1
        row = {}
        for name, size in fields:
            row[name] = data[pos:pos + size].split(b"\0",1)[0].decode("utf-8").strip()
            pos += size
        yield row


def country_shapes(archive):
    with zipfile.ZipFile(archive) as z:
        name = next(n[:-4] for n in z.namelist() if n.endswith(".shp"))
        shp, dbf = z.read(name + ".shp"), z.read(name + ".dbf")
    pos = 100
    for row in dbf_rows(dbf):
        size = struct.unpack_from(">I", shp, pos + 4)[0] * 2
        start = pos + 8
        pos = start + size
        parts, points = struct.unpack_from("<ii", shp, start + 36)
        offsets = list(struct.unpack_from(f"<{parts}i", shp, start + 44)) + [points]
        coords = np.frombuffer(shp, "<f8", points * 2, start + 44 + 4 * parts).reshape(-1, 2)
        yield row, [coords[a:b] for a, b in zip(offsets, offsets[1:])]


def boundaries(cache):
    mask = Image.new("L", (WIDTH, HEIGHT))
    draw = ImageDraw.Draw(mask)
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 180" fill-rule="evenodd">']
    features = {row["ADM0_A3"]: (row,rings) for row,rings in country_shapes(cache/"boundaries.zip")}
    # This is the game's region selection. Keep disjoint island polygons and all intervening water.
    china, china_rings = features["CHN"]
    _, taiwan_rings = features.pop("TWN")
    china_rings.extend(taiwan_rings)
    china["NAME_ZH"] = "中国"
    spratly, spratly_rings = next((row,rings) for row,rings in country_shapes(cache/"ne_10m_admin_0_disputed_areas.zip")
                                  if row["ADM0_A3"] == "PGA" and row["NAME_LONG"] == "Spratly Islands")
    china_rings.extend(spratly_rings)
    for row, rings in features.values():
        paths = []
        for ring in rings:
            xy = np.column_stack((ring[:, 0] + 180, 90 - ring[:, 1]))
            # Shapefile exterior rings run clockwise in geographic coordinates.
            outline = np.sum(xy[:-1, 0] * xy[1:, 1] - xy[1:, 0] * xy[:-1, 1]) > 0
            draw.polygon([tuple(p) for p in xy * (WIDTH / 360)], fill=255 if outline else 0)
            # At 0.01° rounding, several of the island footprints would collapse to a point.
            precision = 5 if max(np.ptp(ring,axis=0)) < .08 else 2
            parts = [f"{x:.{precision}f},{y:.{precision}f}" for x, y in xy[:-1]]
            if len(parts) >= 3:
                path = "M" + " ".join(parts) + "Z"
                paths.append(path if precision == 5 else path.replace(".00",""))
        all_points = np.concatenate(rings)
        box = [*all_points.min(axis=0), *all_points.max(axis=0)]
        attrs = {"id": row["ADM0_A3"], "data-name": row["NAME_ZH"] or row["NAME_EN"],
                 "data-box": ",".join(f"{n:.3f}" for n in box),
                 "data-lon": row["LABEL_X"], "data-lat": row["LABEL_Y"], "d": "".join(paths)}
        if row["ADM0_A3"] == "CHN":
            attrs.update({"data-island-name": "南沙群岛", "data-island-lon": spratly["LABEL_X"],
                          "data-island-lat": spratly["LABEL_Y"]})
        svg.append("<path " + " ".join(k + "=" + quoteattr(v) for k, v in attrs.items()) + "/>")
    document = "\n".join(svg + ["</svg>"])
    assert len(ElementTree.fromstring(document)) > 235
    (OUT / "countries.svg").write_text(document, encoding="utf-8", newline="\n")
    return mask


def height_tiles(cache):
    src = np.empty((2048, 2048), np.float32)
    for x in range(8):
        for y in range(8):
            rgb = np.asarray(Image.open(cache / f"terrain-3-{x}-{y}.png"), dtype=np.float32)
            src[y*256:(y+1)*256, x*256:(x+1)*256] = rgb[..., 0]*256 + rgb[..., 1] + rgb[..., 2]/256 - 32768
    return src


def geographic_sample(src, lon, lat):
    x = ((lon + 180)/360 * 2048 - .5) % 2048
    lat = np.clip(lat, -85.05, 85.05)
    y = np.clip((1 - np.arcsinh(np.tan(np.deg2rad(lat))) / np.pi) * 1024 - .5, 0, 2047)
    i, j = np.floor(x).astype(int), np.floor(y).astype(int)
    k, m = (i + 1) % 2048, np.minimum(j + 1, 2047)
    top = src[np.ix_(j,i)] * (1-(x-i)) + src[np.ix_(j,k)] * (x-i)
    bottom = src[np.ix_(m,i)] * (1-(x-i)) + src[np.ix_(m,k)] * (x-i)
    return (top * (1-(y-j)[:,None]) + bottom * (y-j)[:,None]).astype(np.float32)


def terrain(cache, mask):
    src = height_tiles(cache)
    grid = geographic_sample(src, np.linspace(-180,180,721), np.linspace(90,-90,361))
    grid[0] = 0
    grid[-1] = grid[-2].mean()
    np.round(grid).astype("<i2").tofile(OUT / "height.bin")
    # Bake bathymetric shading in strips to avoid keeping multiple full-size float images.
    with zipfile.ZipFile(cache / "ne1.zip") as z:
        entry = next(n for n in z.namelist() if n.lower().endswith(".tif"))
        path = cache / "ne1.tif"
        if not path.exists():
            with z.open(entry) as source, path.open("wb") as target:
                shutil.copyfileobj(source, target)
    land = Image.open(path).convert("RGB").resize((WIDTH,HEIGHT), Image.Resampling.LANCZOS)
    land = ImageEnhance.Color(land).enhance(1.55)
    terrain_rgb = np.asarray(land, dtype=np.float32)
    # Richer vegetation, warm arid belts, preserved snow and ice whites.
    green = np.clip((terrain_rgb[:,:,1] - terrain_rgb[:,:,2] - 12) / 65, 0, 1)
    level = np.clip((244 - terrain_rgb.mean(axis=2)) / 130, 0, 1)
    terrain_rgb *= 1 - .22*level[:,:,None]
    terrain_rgb -= green[:,:,None] * np.array([25, 12, 26])
    land = Image.fromarray(np.clip(terrain_rgb,0,255).astype("uint8"))
    satellite = Image.open(cache/"blue-marble.jpg").convert("RGB").resize(land.size,Image.Resampling.LANCZOS)
    land = Image.blend(land,ImageEnhance.Color(satellite).enhance(1.18),.75)
    ocean = Image.new("RGB", land.size)
    longitude = (np.arange(WIDTH)+.5)*360/WIDTH-180
    for y in range(0, HEIGHT, 128):
        rows = np.clip(np.arange(y-1,y+129), 0, HEIGHT-1)
        depth = -geographic_sample(src, longitude, 90-(rows+.5)*180/HEIGHT)
        slope = (np.roll(depth,1,axis=1)-np.roll(depth,-1,axis=1) + np.roll(depth,1,axis=0)-np.roll(depth,-1,axis=0))[1:-1]
        depth = depth[1:-1]
        t = np.clip(np.log1p(np.maximum(0,depth)/260)/3.3, 0, 1)
        shade = np.clip(slope/65,-12,12)
        color = np.array([72,153,175])[None,None,:] + t[:,:,None]*np.array([-53,-85,-85]) + shade[:,:,None]
        ocean.paste(Image.fromarray(np.clip(color,0,255).astype("uint8")), (0,y))
    ocean.paste(land, mask=mask)
    ocean.save(OUT / "surface.webp", "WEBP", quality=88, method=6)
    mask.resize((1024,512),Image.Resampling.NEAREST).save(OUT / "land.png",optimize=True)


def night_lights(cache):
    # The grayscale Black Marble composite isolates lights from the daylight terrain.
    with Image.open(cache / "night-lights.jpg") as source:
        source.draft("L", (WIDTH, HEIGHT))
        light = source.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    light = light.point([round(220 * (max(0, value - 5) / 250) ** 1.18) for value in range(256)])
    emission = Image.new("RGBA", light.size, (255, 210, 150, 0))
    emission.putalpha(light)
    emission.save(OUT / "night-lights.webp", "WEBP", lossless=True, method=6)


def flows(cache):
    # Cell centres are (-179.875, -89.875) + (column,row); rows grow north.
    lon, lat = np.arange(360)-179.875, np.arange(180)-89.875
    grid = np.full((180,360,4), -32768, dtype="<i2")
    for c, var in enumerate(("uwnd","vwnd","rhum")):
        txt = (cache / (var+"850.txt")).read_text()
        rows = [np.fromstring(s.split(",",1)[1], sep=",") for s in txt.splitlines() if re.match(r"^\[0\]\[0\]\[\d+\],",s)]
        def axis(name):
            return np.fromstring(re.search(r"\."+name+r"\[\d+\]\s*\n([^\n]+)",txt).group(1),sep=",")
        xs, ys = axis("lon"), axis("lat")
        assert (len(rows),len(rows[0])) == (len(ys),len(xs)) == (73,144)
        along = np.array([np.interp(lon,xs,row,period=360) for row in rows])
        component = np.column_stack([np.interp(lat,ys[::-1],col[::-1]) for col in along.T])
        assert np.isfinite(component).all()
        if var == "rhum":
            assert 0 <= component.min() < component.max() <= 100
            Image.fromarray(np.rint(component[::-1]*2.55).astype(np.uint8)).save(OUT/"humidity.png")
        else:
            assert np.max(np.abs(component)) < 40
            grid[:,:,c] = np.round(component*100)
    with (cache/"currents.csv").open() as f:
        reader = csv.reader(f)
        next(reader); next(reader)
        for month, x, y, u, v in reader:
            assert month == "10"
            if math.isfinite(float(u)) and math.isfinite(float(v)):
                grid[round(float(y)+89.875),round(float(x)+179.875),2:] = np.rint(np.array([float(u),float(v)])*1000)
    assert (grid[:,:,2] != -32768).sum() > 20000
    grid.tofile(OUT/"november.bin")


def cloud_noise():
    # Wrap in both directions; the GPU deforms this density texture with local wind.
    rng = np.random.default_rng(85311)
    total = np.zeros((512,512),np.float32)
    for cells, amplitude in [(4,.63),(8,.43),(16,.29),(32,.20),(64,.13),(128,.08),(256,.035)]:
        a = rng.integers(0,256,(cells,cells), dtype=np.uint8)
        tiled = Image.fromarray(np.tile(a,(3,3))).resize((1536,1536),Image.Resampling.BICUBIC)
        total += np.asarray(tiled.crop((512,512,1024,1024)),np.float32)/255 * amplitude
    total = (total - total.min()) / np.ptp(total)
    Image.fromarray((total*255).astype(np.uint8)).save(OUT/"vapor.webp","WEBP",lossless=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("cache", type=Path, help="Directory for original downloads")
    cache = parser.parse_args().cache
    cache.mkdir(parents=True,exist_ok=True)
    OUT.mkdir(parents=True,exist_ok=True)
    sources(cache)
    terrain(cache,boundaries(cache))
    night_lights(cache)
    flows(cache)
    cloud_noise()
    with Image.open(cache/"kyiv.jpg") as photo:
        thumbnail = ImageOps.fit(photo,(320,320),centering=(.54,.55))
        ImageEnhance.Color(thumbnail).enhance(.58).save(OUT/"kyiv.webp",quality=82)
