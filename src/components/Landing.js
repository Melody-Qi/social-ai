import React, { useEffect, useState } from "react";
import PhotoAlbum from "react-photo-album";
import Lightbox from "yet-another-react-lightbox";
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import Slideshow from "yet-another-react-lightbox/plugins/slideshow";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import styled from "styled-components";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import InputBase from "@mui/material/InputBase";
import IconButton from "@mui/material/IconButton";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import FileUploadRoundedIcon from "@mui/icons-material/FileUploadRounded";
import CircularProgress from "@mui/material/CircularProgress";
import axios from "axios";
import { message, Tag } from "antd";

import PostMessageModal from "./PostMessageModal";
import { BASE_URL, TOKEN_KEY } from "../constants";
import { generateImage, describeProvider } from "../services/imageProvider";

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const MainContainer = styled.div`
  background-color: #27272a;
  height: 100%;
  min-height: 100vh;
`;

const HeaderContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

function Landing() {
  const [index, setIndex] = useState(-1);
  const [inputValue, setInputValue] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState("");
  const [slicedPhotos, setSlicedPhotos] = useState([]);
  // Which provider ACTUALLY produced the image currently on screen. This is
  // set from the `provider` field that generateImage() resolves with -- never
  // from the env -- so a silent fallback (key out of credits, or the circuit
  // breaker sitting open) is reported honestly instead of the UI claiming
  // "OpenAI" while FLUX did the work.
  // Shape: { label, vendor, color } straight from describeProvider(), or null
  // before the first successful generation.
  const [providerInfo, setProviderInfo] = useState(null);
  // Lesson 44 homework: caption dialog state. `isUploading` drives the modal
  // spinner; `composerOpen` decides whether the dialog is on screen.
  const [isUploading, setIsUploading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  // Every time the AI returns a fresh URL (Pollinations URL or OpenAI data
  // URL), push it into the album so the user can click into the Lightbox.
  useEffect(() => {
    if (generatedImageUrl) {
      setSlicedPhotos([
        {
          src: generatedImageUrl,
          width: 200,
          height: 200,
        },
      ]);
    }
  }, [generatedImageUrl]);

  // Generate the image. The provider layer picks Pollinations (default,
  // free, no key) or OpenAI (when REACT_APP_OPENAI_KEY is set) automatically;
  // we only handle the high-level UX -- loading spinner + toast on failure.
  const createImage = async () => {
    if (!inputValue.trim()) {
      message.warning("Please enter a description first.");
      return;
    }
    try {
      setIsGeneratingImage(true);
      // `provider` is the one that actually served the request. It can differ
      // from what REACT_APP_OPENAI_KEY implies: no credits -> 429 -> breaker
      // opens -> Pollinations handles it. We show the truth, not the config.
      const { url, provider } = await generateImage({ prompt: inputValue });
      setGeneratedImageUrl(url);
      setProviderInfo(describeProvider(provider));
    } catch (err) {
      message.error("Image generation failed.");
      console.error("createImage error:", err);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleInputChange = (event) => {
    setInputValue(event.target.value);
  };

  // Upload the AI-generated image to the existing backend pipeline
  // (Lesson 33): blob -> File -> FormData("media_file") -> POST /upload.
  // Works the same whether generatedImageUrl is a Pollinations HTTPS URL
  // or an OpenAI data: URL because fetch handles both transparently.
  //
  // `caption` is the message the user typed in PostMessageModal -- it used to
  // be the hardcoded string "AI generated image".
  // NOTE the parameter is called "caption", not "message": `message` is the
  // antd toast helper imported above, and naming the argument the same thing
  // would shadow it and turn message.success(...) into a crash.
  //
  // Resolves to true on success / false on failure so the caller knows whether
  // it is safe to close its own dialogs.
  const uploadImage = (caption) => {
    if (!generatedImageUrl) {
      message.warning("Generate an image first.");
      return Promise.resolve(false);
    }
    setIsUploading(true);
    return fetch(generatedImageUrl)
      .then((response) => response.blob())
      .then((blob) => {
        const formData = new FormData();
        formData.append("message", caption);
        // The filename extension is load-bearing: handler/post.go does
        //   suffix := strings.ToLower(filepath.Ext(header.Filename))
        //   p.Type = mediaTypes[suffix]   // ".jpg" -> "image"
        // and falls back to "unknown" for anything else. A post with
        // Type="unknown" never shows up when Collection.js filters on
        // mediaType=image, so keep an image extension even though the
        // actual bytes may be PNG. The MIME string below is advisory only;
        // the backend does not sniff magic bytes.
        const file = new File([blob], "upload.jpg", { type: "image/jpeg" });
        formData.append("media_file", file);

        const opt = {
          method: "POST",
          url: `${BASE_URL}/upload`,
          headers: {
            Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
          },
          data: formData,
        };

        return axios(opt)
          .then((res) => {
            // Backend answers 201 Created on success (handler/post.go).
            if (res.status >= 200 && res.status < 300) {
              message.success("Image uploaded successfully!");
              setIndex(-1); // only close the Lightbox when it really posted
              return true;
            }
            message.error("Upload failed.");
            return false;
          })
          .catch((err) => {
            console.error("Upload error:", err);
            message.error("Upload failed.");
            return false;
          });
      })
      .catch((err) => {
        console.error("Upload error:", err);
        message.error("Upload failed.");
        return false;
      })
      .finally(() => {
        setIsUploading(false);
      });
  };

  // The Lightbox upload icon no longer posts straight away -- it opens the
  // caption dialog. The dialog stays open with a spinner until the request
  // settles, and only closes on success, so a failed upload leaves the user
  // inside the Lightbox able to press upload again.
  const handleComposerSubmit = (caption) =>
    uploadImage(caption).then((ok) => {
      if (ok) setComposerOpen(false);
    });

  const handleUploadImage = () => {
    setComposerOpen(true);
  };

  return (
    <MainContainer>
      {isGeneratingImage && (
        <Overlay>
          <CircularProgress color="info" size={80} />
        </Overlay>
      )}

      <HeaderContainer>
        {/* Lesson 44 note: the handout styled this as variant="h1" +
            fontSize="5.2rem" (~83px) with marginTop 128px, which looked
            oversized next to the rest of the app. Reverting to the default
            typography scale: h3 = 3rem = 48px, sitting 64px below the nav,
            giving a ~2.4x ratio against the h6 subtitle (typography best
            practice is 2-3x). */}
        <Typography
          variant="h3"
          component="div"
          sx={{
            mt: 8,
            fontFamily: "Roboto",
            color: "white",
            textDecoration: "none",
          }}
        >
          Social AI
        </Typography>

        {/* Was variant="h5" + fontSize="1.2rem" (~19px). h5 default is 24px
            and h6 default is 20px; h6 pairs better with the 48px h3 above.
            Note: the original sx had `mt: 2` AND `margin: "0 20px"` -- the
            `margin` shorthand silently overrode mt, so the subtitle was
            glued to the title. Split into mt (vertical) + mx (horizontal)
            so both apply. */}
        <Typography
          variant="h6"
          component="div"
          sx={{
            mt: 2,
            mx: "20px",
            fontFamily: "Roboto",
            color: "white",
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          Unleash Creativity, Share Memories—Where AI Meets Your Imagination!
        </Typography>

        <Paper
          component="form"
          sx={{
            p: "2px 4px",
            display: "flex",
            alignItems: "center",
            width: "80%",
            maxWidth: "600px",
            borderRadius: "10px",
            marginTop: "32px",
            marginBottom: "64px",
          }}
          onSubmit={(e) => {
            e.preventDefault();
            createImage();
          }}
        >
          <InputBase
            multiline
            sx={{ ml: 1, flex: 1 }}
            placeholder="Enter a detailed description of the photo you want to create…"
            value={inputValue}
            onChange={handleInputChange}
          />
          {/* disabled while a request is in flight: otherwise a double-click
              (or two Enters) fires two parallel generate calls and burns
              twice the quota on the shared key. */}
          <IconButton
            type="submit"
            sx={{ p: "10px" }}
            aria-label="generate"
            disabled={isGeneratingImage}
          >
            <ArrowForwardIcon />
          </IconButton>
        </Paper>
      </HeaderContainer>

      <PhotoAlbum
        photos={slicedPhotos}
        layout="rows"
        targetRowHeight={200}
        onClick={({ index: i }) => setIndex(i)}
      />

      {/* Credit the model that actually ran. Only rendered once something has
          been generated, and driven by the provider generateImage() resolved
          with rather than by the env -- so after a silent fallback the badge
          says FLUX, not OpenAI. Colours: purple = OpenAI, blue = free FLUX. */}
      {providerInfo && (
        <div style={{ textAlign: "center", marginTop: "12px" }}>
          <Tag
            color={providerInfo.color}
            style={{
              fontSize: "0.8rem",
              padding: "3px 12px",
              borderRadius: "12px",
            }}
          >
            {providerInfo.label}
          </Tag>
        </div>
      )}

      <Lightbox
        slides={slicedPhotos}
        open={index >= 0}
        index={index}
        close={() => setIndex(-1)}
        toolbar={{
          buttons: [
            <IconButton
              key="upload"
              type="button"
              sx={{ p: "10px" }}
              aria-label="upload"
              onClick={handleUploadImage}
            >
              <FileUploadRoundedIcon sx={{ color: "white" }} />
            </IconButton>,
          ],
        }}
        plugins={[Fullscreen, Slideshow, Thumbnails, Zoom]}
      />

      {/* Lesson 44 homework: ask the user for the caption before posting.
          Rendered OUTSIDE <Lightbox> on purpose: the Lightbox portal owns
          z-index 9999 and captures keyboard events, so nesting a text input
          inside it would fight focus handling. PostMessageModal sets
          zIndex={10000} so it stacks above the fullscreen Lightbox. */}
      <PostMessageModal
        open={composerOpen}
        confirmLoading={isUploading}
        defaultMessage="AI generated image"
        onCancel={() => setComposerOpen(false)}
        onSubmit={handleComposerSubmit}
      />

      {/* The old dev-only "image provider: ..." footer is gone on purpose.
          It called activeProviderName(), which reports the CONFIGURED provider
          before any request is made -- so it kept printing "OpenAI ..." even
          after the circuit breaker had already fallen back to Pollinations.
          The Tag below the album reports what actually produced the image. */}
    </MainContainer>
  );
}

export default Landing;