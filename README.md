# Obsidian Image Uploader

![](https://i.loli.net/2021/07/16/fxWBeLAESNc6tK9.gif)

This plugin could resize(optional) and upload the image in your clipboard to any image hosting automatically when pasting.

## Changelog
- 0.3.3
    - Add support for S3 compatible object storage (e.g., Cloudflare R2, AWS S3, MinIO).
    - Introduce "Uploader Service Type" setting to switch between "Generic API" and "S3 Compatible".
- 0.3.2
	- Add 'Upload All Local Images in This Page' command.
- 0.3.1
	- Fix some minor problems.
- 0.3.0
	- Support Obsidian Live Preview Editor.

## Getting started

### Settings

The plugin offers two main uploader service types: "Generic API" and "S3 Compatible".

**1. Uploader Service Type:**
   - Choose between "Generic API" or "S3 Compatible" based on your image hosting service.

**2. Generic API Settings:**
   - **Api Endpoint**: the Endpoint of the image hosting api.
   - **Upload Header**: the header of upload request in **json** format.
   - **Upload Body**: the body of upload request in **json** format. Don't change it unless you know what you are doing. `$FILE` will be replaced by the image file.
   - **Image Url Path**: the path to the image url in http response. (e.g., `data.link`)

**3. S3 Compatible Service Settings:**
   - **S3 Access Key ID**: Your S3 compatible service Access Key ID.
   - **S3 Secret Access Key**: Your S3 compatible service Secret Access Key.
   - **S3 Bucket Name**: The name of your S3 bucket.
   - **S3 Region**: The region of your S3 bucket (e.g., `us-east-1`, `auto` for Cloudflare R2).
   - **S3 Endpoint (Optional)**: The custom S3 API endpoint URL. Required for services like Cloudflare R2 (e.g., `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`), MinIO, etc. Leave empty for AWS S3 default.
   - **S3 Path Prefix (Optional)**: A path prefix to upload files into a specific folder within the bucket (e.g., `images` or `blog/assets`).
   - **S3 Public URL Base (Optional)**: If you use a custom domain or CDN for your bucket, enter the base URL here (e.g., `https://my-custom-domain.com`). The plugin will append the object key to this base. If left empty, a standard URL will be constructed based on the endpoint, bucket, and region.
   - **S3 Force Path Style (Optional)**: Enable if your S3-compatible service requires path-style access (e.g., `http://endpoint/bucket/key`). Default is virtual-hosted style.

**4. Common Settings:**
   - **Enable Resize**: whether resizing images before uploading.
   - **Max Width**: images that wider than this will be resized by the natural aspect ratio.

### Examples

#### Generic API Example: Imgur

Take Imgur as an example. The upload request is something like this:

```shell
curl --location --request POST 'https://api.imgur.com/3/image' \
--header 'Authorization: Client-ID {{clientId}}' \
--form 'image="R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"'
```

So, `Api Endpoint` should be `https://api.imgur.com/3/image` and `Upload Header` should be `{"Authorization": "Client-ID {{clientId}}"}`.

The response of the upload request is:

```json
{
	"data": {
		"id": "orunSTu",
		"title": null,
		"description": null,
		"datetime": 1495556889,
		"type": "image/gif",
		"animated": false,
		"width": 1,
		"height": 1,
		"size": 42,
		"views": 0,
		"bandwidth": 0,
		"vote": null,
		"favorite": false,
		"nsfw": null,
		"section": null,
		"account_url": null,
		"account_id": 0,
		"is_ad": false,
		"in_most_viral": false,
		"tags": [],
		"ad_type": 0,
		"ad_url": "",
		"in_gallery": false,
		"deletehash": "x70po4w7BVvSUzZ",
		"name": "",
		"link": "http://i.imgur.com/orunSTu.gif"
	},
	"success": true,
	"status": 200
}
```

All you need is the image url `http://i.imgur.com/orunSTu.gif`, so `Image Url Path` should be `data.link`.

#### Generic API Example: Lsky-Pro

[Lsky-Pro](https://github.com/lsky-org/lsky-pro) is a open-sourced and self-hosted image hosting solution.

Thanks to [@xaya1001](https://github.com/Creling/obsidian-image-uploader/issues/9#issuecomment-1562861494) for this example.

```
api endpoint：https://img.domain.com/api/v1/upload

upload header: 
{
  "Authorization": "Bearer xxxx",
  "Accept": "application/json",
  "Content-Type": "multipart/form-data"
}

upload body: 
{
  "file": "$FILE"
}

Image Url Path: data.links.url
```

#### S3 Compatible Example: Cloudflare R2

To use Cloudflare R2:

1.  Select "S3 Compatible" as the **Uploader Service Type**.
2.  Fill in the S3 settings:
      - **S3 Access Key ID**: Your R2 Access Key ID.
      - **S3 Secret Access Key**: Your R2 Secret Access Key.
      - **S3 Bucket Name**: The name of your R2 bucket.
      - **S3 Region**: Typically `auto` for R2.
      - **S3 Endpoint**: `https://<YOUR_ACCOUNT_ID>.r2.cloudflarestorage.com` (Replace `<YOUR_ACCOUNT_ID>` with your actual Cloudflare account ID).
      - **S3 Path Prefix (Optional)**: e.g., `obsidian/images` to store images in that folder structure.
      - **S3 Public URL Base (Optional)**: If you have a custom domain connected to your R2 bucket (e.g., `https://my-r2-images.example.com`), enter it here.
3.  Ensure your R2 bucket has the correct CORS policy configured (see example below).

```
[
  {
    "AllowedOrigins": [
      "app://obsidian.md",
      "https://my-r2-images.example.com"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD",
      "PUT"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ]
  }
]
```

## Thanks

1. [obsidian-imgur-plugin](https://github.com/gavvvr/obsidian-imgur-plugin)
2. [create-obsidian-plugin](https://www.npmjs.com/package/create-obsidian-plugin)
