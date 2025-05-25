import {
  Notice,
  Plugin,
  Editor,
  MarkdownView,
  EditorPosition,
  normalizePath,
  WorkspaceLeaf, // Added for type safety with originalLeaf
} from "obsidian";

import axios from "axios";
import objectPath from 'object-path';
import ImageUploaderSettingTab from './settings-tab';
import Compressor from 'compressorjs';

// Import S3Client and PutObjectCommand from AWS SDK
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

import {
  PasteEventCopy,
} from './custom-events';
import { resolve } from "path";


// Avoid the error: Property 'clipboardManager' does not exist on type 'MarkdownSubView'
declare module 'obsidian' {
  interface MarkdownSubView {
    clipboardManager: ClipboardManager
  }
}

interface ClipboardManager {
  handlePaste(e: ClipboardEvent): void
  handleDrop(e: DragEvent): void
}

interface ImageUploaderSettings {
  apiEndpoint: string;
  uploadHeader: string;
  uploadBody: string;
  imageUrlPath: string;
  maxWidth: number;
  enableResize: boolean;

  // New settings for S3 compatibility
  uploaderServiceType: 'Generic API' | 'S3 Compatible';
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3BucketName: string;
  s3Region: string;
  s3Endpoint?: string;       // Optional: For R2 and other S3-compatible services
  s3PathPrefix?: string;     // Optional: For uploading to a subfolder
  s3ForcePathStyle?: boolean;// Optional: For services like MinIO that might require path-style access
  s3PublicUrlBase?: string;  // Optional: For custom domains or non-standard public URL construction
}

const DEFAULT_SETTINGS: ImageUploaderSettings = {
  apiEndpoint: "",
  uploadHeader: "",
  uploadBody: "{\"image\": \"$FILE\"}",
  imageUrlPath: "",
  maxWidth: 4096,
  enableResize: false,

  // Defaults for new S3 settings
  uploaderServiceType: 'Generic API',
  s3AccessKeyId: '',
  s3SecretAccessKey: '',
  s3BucketName: '',
  s3Region: '',
  s3Endpoint: '',
  s3PathPrefix: '',
  s3ForcePathStyle: false,
  s3PublicUrlBase: '',
};

interface pasteFunction {
  (this: HTMLElement, event: ClipboardEvent): void;
}

export default class ImageUploader extends Plugin {
  settings: ImageUploaderSettings;
  pasteFunction: pasteFunction;

  private replaceText(editor: Editor, target: string, replacement: string): void {
    target = target.trim()
    const lines = editor.getValue().split("\n");
    for (let i = 0; i < lines.length; i++) {
      const ch = lines[i].indexOf(target)
      if (ch !== -1) {
        const from = { line: i, ch: ch } as EditorPosition;
        const to = { line: i, ch: ch + target.length } as EditorPosition;
        editor.setCursor(from);
        editor.replaceRange(replacement, from, to);
        break;
      }
    }
  }

  async pasteHandler(ev: ClipboardEvent, editor: Editor, mkView: MarkdownView): Promise<void> {
    if (ev.defaultPrevented) {
      console.log("paste event is canceled");
      return;
    }

    let clipboardData = ev.clipboardData?.files[0];
    const imageType = /image.*/;
    if (clipboardData && clipboardData.type.match(imageType)) {
      let file: File = clipboardData!;
      ev.preventDefault();

      // set the placeholder text
      const randomString = (Math.random() * 10086).toString(36).substring(0, 8);
      const pastePlaceText = `![uploading...](${randomString})\n`
      editor.replaceSelection(pastePlaceText)

      // resize the image
      if (this.settings.enableResize) {
        const maxWidth = this.settings.maxWidth
        const compressedFile = await new Promise((resolve, reject) => {
          new Compressor(file, {
            maxWidth: maxWidth,
            success: resolve,
            error: reject,
          })
        })
        file = compressedFile as File
      }

      this.uploadOrDispatch(file, file.name).then(url => {
        const imgMarkdownText = `![](${url})`
        this.replaceText(editor, pastePlaceText, imgMarkdownText)
      }, err => {
        new Notice('[Image Uploader] Upload unsuccessfully, fall back to default paste!', 5000)
        console.log(err)
        this.replaceText(editor, pastePlaceText, "");
        mkView.currentMode.clipboardManager.handlePaste(
          new PasteEventCopy(ev)
        );
      })
    }
  }

  // NEW: Method to decide which uploader to use
  async uploadOrDispatch(file: File | ArrayBuffer, fileName: string): Promise<string> {
    try {
        if (this.settings.uploaderServiceType === 'S3 Compatible') {
            return await this.uploadToS3(file, fileName);
        } else {
            return await this.uploadImageGeneric(file, fileName);
        }
    } catch (err) {
        console.error("Upload failed:", err);
        // A more specific notice might have been shown already by uploadToS3 or uploadImageGeneric
        // If not, this serves as a general fallback notice.
        if (!(err instanceof Error && err.message.includes("S3 configuration incomplete")) && 
            !(err instanceof Error && err.message.includes("Upload failed"))) { // Avoid double notices
             new Notice(`[Image Uploader] Upload failed: ${err.message || 'Unknown error'}`, 5000);
        }
        throw err; // Re-throw to be caught by pasteHandler or uploadLocalImages
    }
  }



  async uploadImageGeneric(imageContent: File | ArrayBuffer, imageName: string): Promise<string> {

    return new Promise((resolve, reject) => {
      const formData = new FormData()
      const uploadBody = JSON.parse(this.settings.uploadBody)

      for (const key in uploadBody) {
        if (uploadBody[key] == "$FILE") {
          formData.append(key, imageContent instanceof ArrayBuffer ? new Blob([imageContent]) : imageContent, imageName)
        }
        else {
          formData.append(key, uploadBody[key])
        }
      }

      axios.post(this.settings.apiEndpoint, formData, {
        "headers": JSON.parse(this.settings.uploadHeader)
      }).then(res => {
        const url = objectPath.get(res.data, this.settings.imageUrlPath)
        resolve(url)
      }, err => {
        reject(err)
      })
    })
  }

  private async uploadToS3(fileContent: File | ArrayBuffer, fileName: string): Promise<string> {
    const {
        s3AccessKeyId,
        s3SecretAccessKey,
        s3BucketName,
        s3Region,
        s3Endpoint,
        s3PathPrefix,
        s3ForcePathStyle,
        s3PublicUrlBase
    } = this.settings;

    if (!s3AccessKeyId || !s3SecretAccessKey || !s3BucketName || !s3Region) {
        const errMsg = "S3 configuration is incomplete. Please check Access Key, Secret Key, Bucket Name, and Region in settings.";
        new Notice(errMsg, 7000);
        throw new Error(errMsg);
    }

    const client = new S3Client({
        region: s3Region,
        credentials: {
            accessKeyId: s3AccessKeyId,
            secretAccessKey: s3SecretAccessKey,
        },
        endpoint: s3Endpoint || undefined,
        forcePathStyle: s3ForcePathStyle || false,
    });

    const keyPrefix = s3PathPrefix ? (s3PathPrefix.endsWith('/') ? s3PathPrefix : `${s3PathPrefix}/`) : '';
    const key = keyPrefix + fileName;
    
    const body = fileContent instanceof File ? await fileContent.arrayBuffer() : fileContent;
    const contentType = fileContent instanceof File ? fileContent.type : 'application/octet-stream';

    const putObjectParams = {
        Bucket: s3BucketName,
        Key: key,
        Body: body instanceof ArrayBuffer ? new Uint8Array(body) : body, // SDK expects Uint8Array or stream
        ContentType: contentType,
        // ACL: 'public-read', // Usually handled by bucket policy for better security. Uncomment if explicitly needed.
    };

    try {
        await client.send(new PutObjectCommand(putObjectParams));

        let publicUrl: string;
        const encodedKey = key.split('/').map(encodeURIComponent).join('/'); // Ensure key components are URL-safe

        if (s3PublicUrlBase) {
            publicUrl = `${s3PublicUrlBase.replace(/\/$/, '')}/${encodedKey}`;
        } else if (s3Endpoint) {
            const endpointUrl = new URL(s3Endpoint);
            if (s3ForcePathStyle) {
                publicUrl = `${endpointUrl.protocol}//${endpointUrl.host}/${s3BucketName}/${encodedKey}`;
            } else {
                 // Standard for R2 and many S3-compatibles when custom endpoint is used
                publicUrl = `${endpointUrl.protocol}//${endpointUrl.host}/${s3BucketName}/${encodedKey}`;
                 // For Cloudflare R2, if endpoint is https://<ACCOUNT_ID>.r2.cloudflarestorage.com
                 // then this becomes https://<ACCOUNT_ID>.r2.cloudflarestorage.com/<BUCKET_NAME>/<OBJECT_KEY>
            }
        } else {
            // Default AWS S3 URL (virtual-hosted style)
            publicUrl = `https://${s3BucketName}.s3.${s3Region}.amazonaws.com/${encodedKey}`;
        }
        new Notice(`Image uploaded to S3: ${fileName}`, 3000);
        return publicUrl;

    } catch (error) {
        console.error("S3 Upload Error:", error);
        const errMsg = error instanceof Error ? error.message : String(error);
        new Notice(`S3 Upload failed: ${errMsg}`, 7000);
        throw error; // Re-throw to be caught by uploadOrDispatch
    }
}  

  async uploadLocalImages(): Promise<void> {
    // Get the current active MarkdownView
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView) return;

    // Check current view state and switch if in Reading View
    const viewState = markdownView.getState();
    if (viewState.mode === 'preview') {
      new Notice("Switching from Reading View to Live Preview to upload images...", 5000);
      await markdownView.setState(
        { ...viewState, mode: "source", source: false }, // Switch to Live Preview
        { history: false } // Avoid adding this switch to navigation history
      );
      if (!markdownView.editor) {
        new Notice("Failed to switch to an editable view or editor not available after switch. Aborting operation.", 7000);
        return;
      }
      new Notice("Switched to Live Preview. Proceeding with image upload.", 5000);
    }

    // Get Editor
    const editor = markdownView.editor;
    // Get all the text
    const lines = editor.getValue().split("\n");

    const allFiles = this.app.vault.getFiles();

    let imageNameAndLinks: { [key: string]: string }[] = [];
    let imageNames: string[] = [];

    for (let line of lines) {
      // Match ![[...<Image Name>.<ext>]] or ![](...<Image Name>.<ext>)
      const imageLinks = line.match(/(!\[\[.+\]\])|(!\[.+\(.+\))/gm);
      if (!imageLinks) continue;

      for (const imageLink of imageLinks) {

        // Match ...<Image Name>.<ext>
        let imageInfo = imageLink.match(/(?:\[\[|!\[]\()(?<uri>.*?)(?:\)|\]\])/);
        if (!imageInfo) continue;

        let imageURI = imageInfo?.groups?.uri!;

        if (imageURI.startsWith("http")) continue

        // Get <Image Name>.<ext>
        const imageName = decodeURIComponent(imageURI.split("/").pop()!);
        imageNameAndLinks.push({ [imageName]: imageLink });
        imageNames.push(imageName);
      }
    }

    const targetImages = allFiles.filter(file => {
      return imageNames.includes(file.name);
    });

    const uploadPromises: Promise<void>[] = [];

    for (const targetImage of targetImages) {
      const data = await this.app.vault.adapter.readBinary(normalizePath(targetImage.path));
      const blob = new Blob([data]);
      const file = new File([blob], targetImage.name, { type: 'image/png' });

      const uploadPromise = this.uploadOrDispatch(file, targetImage.name).then(url => {
        const imgMarkdownText = `![](${url})`
        const imageNameAndLink = imageNameAndLinks.find((item: { [key: string]: string }) => {
          return Object.keys(item)[0] === targetImage.name;
        });
        if (imageNameAndLink) {
          const imageLink = imageNameAndLink[targetImage.name];
          this.replaceText(editor, imageLink, imgMarkdownText);
        }
      }, err => {
        new Notice('[Image Uploader] Upload unsuccessfully for ' + targetImage.name, 5000)
        console.log(err)
      });

      uploadPromises.push(uploadPromise);
    }

    if (uploadPromises.length > 0) {
        await Promise.allSettled(uploadPromises);
        new Notice(`Finished processing ${uploadPromises.length} image(s) for ${markdownView.file?.basename}.`, 3000);
    }


    // const data = await this.app.vault.adapter.readBinary(imagePath);
    // const blob = new Blob([data]);
    // const file = new File([blob], imageName, { type: 'image/png' });

    // this.uploadImage(file).then(url => {
    //   const imgMarkdownText = `![](${url})`
    //   this.replaceText(editor, imageLink, imgMarkdownText)
    // }, err => {
    //   new Notice('[Image Uploader] Upload unsuccessfully, fall back to default paste!', 5000)
    //   console.log(err)

    // })

  }


  // --- NEW METHOD TO UPLOAD IMAGES IN ALL VAULT FILES ---
  async uploadAllLocalImagesInVault(): Promise<void> {
    const markdownFiles = this.app.vault.getMarkdownFiles(); // Returns TFile[]
    if (!markdownFiles || markdownFiles.length === 0) {
      new Notice("No markdown files found in the vault.", 3000);
      return;
    }

    new Notice(`Starting to process ${markdownFiles.length} markdown file(s) in the vault. This may be disruptive as files will be opened sequentially.`, 5000);

    const originalLeaf: WorkspaceLeaf | null = this.app.workspace.activeLeaf;
    let filesProcessed = 0;
    let filesWithErrors = 0;
    const totalFiles = markdownFiles.length;

    for (let i = 0; i < totalFiles; i++) {
      const file = markdownFiles[i];
      // It's important to get a leaf that can open Markdown files.
      let leaf = this.app.workspace.getLeaf(false); 
      if (!leaf) {
          new Notice("Could not get a workspace leaf to open files. Aborting vault processing.", 5000);
          if (originalLeaf) this.app.workspace.setActiveLeaf(originalLeaf, { focus: true });
          return;
      }
      
      try {
        new Notice(`Processing file ${i + 1}/${totalFiles}: ${file.path}`, 3000);
        await leaf.openFile(file, { active: true }); // Open and make active
        
        // Short delay to allow Obsidian to fully switch the view and ready the editor
        await new Promise(resolve => setTimeout(resolve, 300)); 

        await this.uploadLocalImages(); // Call the existing function, which works on the active view
        filesProcessed++;
      } catch (error) {
        filesWithErrors++;
        new Notice(`Error during vault-wide processing of ${file.path}: ${error.message}`, 7000);
        console.error(`Error during vault-wide processing of ${file.path}:`, error);
      }
    }

    if (originalLeaf && this.app.workspace.activeLeaf !== originalLeaf) {
       await this.app.workspace.setActiveLeaf(originalLeaf, { focus: true });
    }

    let summaryMessage = `Vault processing complete. Processed ${filesProcessed} of ${totalFiles} file(s).`;
    if (filesWithErrors > 0) {
      summaryMessage += ` Encountered errors in ${filesWithErrors} file(s). Check console for details.`;
    }
    new Notice(summaryMessage, 7000);
  }

  async onload(): Promise<void> {
    console.log("loading Image Uploader");
    await this.loadSettings();
    // this.setupPasteHandler()
    this.addSettingTab(new ImageUploaderSettingTab(this.app, this));

    this.pasteFunction = this.pasteHandler.bind(this);

    this.registerEvent(
      this.app.workspace.on('editor-paste', this.pasteFunction)
    );

    this.addCommand({
      id: 'upload-all-local-images-in-this-page', 
      name: 'Image Uploader: Upload All Local Images in This Page',
      callback: this.uploadLocalImages.bind(this),
    });

    this.addCommand({
      id: 'upload-all-local-images-in-vault',
      name: 'Image Uploader: Upload All Local Images in This Vault In One Go',
      callback: this.uploadAllLocalImagesInVault.bind(this),
    });
  }

  onunload(): void {
    this.app.workspace.off('editor-paste', this.pasteFunction);
    console.log("unloading Image Uploader");
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}