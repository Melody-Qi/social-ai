import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { App as AntdApp, Button } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import axios from "axios";
import { BASE_URL, TOKEN_KEY } from "../constants";
import PhotoAlbum from "react-photo-album";
import Lightbox from "yet-another-react-lightbox";
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import Slideshow from "yet-another-react-lightbox/plugins/slideshow";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import DeleteIcon from "@mui/icons-material/Delete";
import IconButton from "@mui/material/IconButton";

const unavailableImage =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="#eeeeee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#777777" font-family="sans-serif" font-size="28">Image unavailable</text></svg>'
  );

const captionStyle = {
  backgroundColor: "rgba(0, 0, 0, 0.6)",
  maxHeight: "240px",
  overflow: "hidden",
  position: "absolute",
  bottom: "0",
  width: "100%",
  color: "white",
  padding: "2px",
  fontSize: "90%",
};

const wrapperStyle = {
  display: "block",
  minHeight: "1px",
  width: "100%",
  border: "1px solid #ddd",
  overflow: "hidden",
};

function PhotoGallery(props) {
  const [images, setImages] = useState(props.images);
  const [index, setIndex] = useState(-1);
  const { message } = AntdApp.useApp();

  // A new search gives this component a new images prop. Keep the local list
  // in sync while still allowing a successfully deleted image to disappear
  // immediately without waiting for another backend search.
  useEffect(() => {
    setImages(props.images);
  }, [props.images]);

  const imageArr = images.map((image) => ({
    ...image,
    width: 200,
    height: 200,
  }));

  const onDeleteImage = (postId) => {
    if (window.confirm("Are you sure you want to delete this image?")) {
      const newImageArr = images.filter((img) => img.postId !== postId);
      console.log("delete image ", newImageArr);
      const opt = {
        method: "DELETE",
        url: `${BASE_URL}/post/${postId}`,
        headers: {
          Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
        },
      };

      axios(opt)
        .then((res) => {
          console.log("delete result -> ", res);
          if (res.status === 200) {
            setImages(newImageArr);
          }
        })
        .catch((err) => {
          message.error("Delete posts failed!");
          console.log("Delete posts failed: ", err.message);
        });
    }
  };

  const updateIndex = ({ index }) => {
    setIndex(index);
  };

  return (
    <div style={wrapperStyle}>
      <PhotoAlbum
        photos={imageArr}
        layout="rows"
        targetRowHeight={200}
        // targetRowHeight is only an optimization target. A rows layout may
        // enlarge a short final row to fill the container, so cap that row to
        // prevent one or two search results from becoming enormous.
        rowConstraints={{ singleRowMaxHeight: 240 }}
        onClick={updateIndex}
        renderPhoto={({ photo, imageProps, wrapperStyle }) => (
          <div
            key={photo.postId}
            style={{
              ...wrapperStyle,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <img
              {...imageProps}
              alt={photo.caption}
              onError={(event) => {
                // Some seed posts contain a web-page URL instead of an image
                // URL. Show a clear placeholder instead of broken alt text.
                event.currentTarget.onerror = null;
                event.currentTarget.src = unavailableImage;
              }}
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                objectFit: "cover",
              }}
            />
            <div style={captionStyle}>
              <div>{`${photo.user}: ${photo.caption}`}</div>
              <Button
                style={{ marginTop: "10px", marginLeft: "5px" }}
                key="deleteImage"
                type="primary"
                icon={<DeleteOutlined />}
                size="small"
                onClick={() => onDeleteImage(photo.postId)}
              >
                Delete Image
              </Button>
            </div>
          </div>
        )}
      />
      <Lightbox
        slides={imageArr}
        open={index >= 0}
        index={index}
        close={() => setIndex(-1)}
        plugins={[Fullscreen, Slideshow, Thumbnails, Zoom]}
        on={{
          view: updateIndex,
        }}
        toolbar={{
          buttons: [
            <IconButton
              key="delete"
              type="button"
              sx={{ p: "10px" }}
              aria-label="delete the image"
              onClick={() => {
                onDeleteImage(imageArr[index]?.postId);
              }}
            >
              <DeleteIcon sx={{ color: "#CCCCCC" }} />
            </IconButton>,
          ],
        }}
      />
    </div>
  );
}

PhotoGallery.propTypes = {
  images: PropTypes.arrayOf(
    PropTypes.shape({
      postId: PropTypes.string.isRequired,
      user: PropTypes.string.isRequired,
      caption: PropTypes.string.isRequired,
      src: PropTypes.string.isRequired,
      thumbnail: PropTypes.string.isRequired,
      thumbnailWidth: PropTypes.number.isRequired,
      thumbnailHeight: PropTypes.number.isRequired,
    })
  ).isRequired,
};

export default PhotoGallery;
