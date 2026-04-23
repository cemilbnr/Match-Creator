# Custom Asset Spec — MC_Assets.blend

Match Creator addon'u kendi tile ve tileback modellerinle çalışsın diye bir
`.blend` dosyası hazırlaman yeterli. İçindeki objelere/materyallere aşağıdaki
adları verirsen addon dosyayı açıp template olarak kullanır; vermezsen
procedural placeholder devreye girer. Her board için sadece bir kere okunur,
sonraki build'lerde Blender'ın kendi library sistemi cache'ler.

## 1. Dosya

- Nerede olursa olsun — Blender addon preferences → **Asset .blend** alanına
  tam yolu gir. (`Edit → Preferences → Add-ons → Match-3 Animator → ▸`)
- Örnek konum: `C:\Users\Cemil\Documents\MC_Assets.blend` veya proje kökünde
  `assets/MC_Assets.blend`.
- Güncellersen Blender'ı yeniden başlatman gerekmez — addon her build'de
  dosyayı okur ve eksik olan template'leri yükler. Mevcut objeler/materyaller
  zaten import edildiyse tekrar dokunmaz (Blender bpy.data cache).

## 2. Objeler

İki obje:

| Obje adı       | Ne olmalı                                                                 |
|----------------|---------------------------------------------------------------------------|
| `MC_Tile`      | Oyun tile'ı — önde duran, match olduğunda scale-to-0 olan parça.          |
| `MC_Tileback`  | Cell arkası / çerçeve — sabit durur, sadece match olan cell'de 0 olur.    |

### Zorunlu kurallar

1. **İsim harf bire bir:** `MC_Tile`, `MC_Tileback`. Collection adı önemli değil.
2. **Dünya merkezine konumlanmış:** her iki objenin `location` değeri `(0,0,0)`
   olmalı. Addon her cell için `bpy.data.objects.new()` ile çoğaltır ve o
   cell'in world pos'una taşır.
3. **Origin noktası = scale pivotu.** Scale 1→0 olurken parça origin'e
   toplanır. Tile'ın origin'ini görsel merkezine koy ki küçülürken komşu
   cell'e taşma olmasın.
4. **Boyut = 1×1 Blender unit.** Tile'ın X ve Z yönünde toplam genişliği **1
   unit**. Tileback'in footprint'i (X/Z) de **1 unit × 1 unit**. Y ekseni
   derinlik — istediğin gibi.
5. **Apply Transforms** (Ctrl+A → Scale) yapılmış olsun. Object'in scale'i
   `1.0` görünmeli. Aksi halde key insert sırasında karışır.

### Origin nasıl ayarlanır

Obje seçili → Object → Set Origin → **Origin to Geometry** (geometri merkezi)
veya **Origin to 3D Cursor** (kendi belirlediğin nokta). Tile gibi yassı bir
plane için Geometry merkezi iyidir — scale merkezden olur. Tileback için de
aynı: merkezde. Farklı bir davranış istersen (örn. yukarıdan aşağı küçülsün)
origin'i o yönde kaydır.

## 3. Materyaller

4 tile rengi + 1 tileback rengi = 5 materyal. İsimler zorunlu:

| Materyal adı            | Kullanımı                          |
|-------------------------|-----------------------------------|
| `MC_Material_Red`       | Kırmızı tile'lar                  |
| `MC_Material_Green`     | Yeşil tile'lar                    |
| `MC_Material_Blue`      | Mavi tile'lar                     |
| `MC_Material_Yellow`    | Sarı tile'lar                     |
| `MC_Material_Tileback`  | Tüm tileback'ler                  |

Materyalleri direkt `MC_Tile` objesine atamana gerek yok — addon her tile
için doğru renk materyali override eder (shared-mesh bug'ı fix'i bu yüzden
object-level slot'a atıyor). Ama dosyada **tanımlı olmaları** yeterli —
tile'ın default slot'unda herhangi biri olabilir (tercihen `MC_Material_Red`
veya görünüme yakın bir şey), addon her zaman `MC_Material_<Color>`'ı
çağırır.

Eksik materyal varsa: eksik renk için addon procedural fallback'e düşer
(BSDF + _COLOR_HEX tablosundaki düz renk).

## 4. Minimum çalışan örnek

Boş bir scene:

1. `Add → Mesh → Plane` → `Object` adını `MC_Tile` yap.
   - `S` ile `1`'e scale'le (veya zaten 1×1 plane).
   - Yönünü Z ekseninde dik dur (rotate X=90°) veya seninle aynı yön — test et.
   - `Ctrl+A → Rotation & Scale` uygula.
   - `Object → Set Origin → Origin to Geometry`.
2. `Add → Mesh → Cube` → `Object` adını `MC_Tileback` yap.
   - `S` ile `0.5`'e scale → `Ctrl+A → Scale` → 1×1×1 olur. X/Z'de 1 olacak
     şekilde daha sonra ince slab haline getirebilirsin (Edit Mode → Y
     verts'leri `0.2`/`-0.2`'ye çek).
   - Bevel modifier ekle istersen.
3. 5 materyal ekle: `MC_Material_Red` / `_Green` / `_Blue` / `_Yellow` /
   `_Tileback`. BSDF + base color seç. Hepsini `MC_Tile` veya `MC_Tileback`'ın
   slot'larına eklemene gerek yok — bpy.data.materials içinde bulunmaları
   yeterli.
4. Dosyayı kaydet: `File → Save As` → `MC_Assets.blend`.
5. Match Creator addon preferences → **Asset .blend** → bu dosyayı seç.
6. Match Creator'dan `Send to Blender` veya `Update variant` — yeni
   collection'da objeler artık senin template'lerinden klonlanmış halde.

## 5. Önemli gotcha'lar

- **Boyut değiştirirsen** (örn. tile'ı 1.2×1.2 yaptın) **cell'ler çakışır**
  çünkü board layout 1 unit spacing kullanıyor. Tile'ı 1×1 tut, büyük
  göstermek istiyorsan tüm `GP_MC` collection'ını scale'le.
- **Origin noktasını değiştirirsen** scale pivotu değişir. İstemeden
  küçülme sırasında tile'lar bir yöne kayıp kalabilir. Genelde Origin'i
  geometry merkezine koy.
- **`MC_Tile` objesini silersen** yeni build'de yeniden import edilir
  (dosyada olmak koşuluyla).
- **Modifier'lar** (Bevel, Subdivision Surface vs.) object'e bağlı, mesh'in
  kendisine değil. Template object'teki modifier'lar KLONLANMIYOR şu anda —
  sadece mesh data reference'lanıyor. İstersen bunu destek olarak ekleriz,
  ama önce sade versiyonu test et.
