import React, { Component } from "react";
import { Button, Modal, message } from "antd";
import axios from "axios";

import { PostForm } from "./PostForm";
import { BASE_URL, TOKEN_KEY } from "../constants";

class CreatePostButton extends Component {
  state = {
    visible: false,
    confirmLoading: false,
  };

  showModal = () => {
    this.setState({
      visible: true,
    });
  };

  handleOk = () => {
    this.setState({
      confirmLoading: true,
    });

    // this.postForm is the Ant Design Form INSTANCE (not a DOM node), captured
    // by the ref in render(). validateFields() manually runs the "rules" of
    // every Form.Item declared in PostForm.js and returns a Promise:
    //   - every rule passes -> resolve(values), e.g. { description, uploadPost }
    //   - any rule fails    -> reject({ errorFields, values })
    // A Modal's onOk button knows nothing about antd Forms, so an explicit
    // call is required before we are allowed to read the field values.
    this.postForm
      .validateFields()
      .then((form) => {
        const { description, uploadPost } = form;
        const { type, originFileObj } = uploadPost[0];

        // Extract the top-level media type: "image" or "video".
        // Guard against unexpected file types to avoid a null regex crash.
        const typeMatch = type.match(/^image|video/);
        const postType = typeMatch ? typeMatch[0] : null;

        const formData = new FormData();
        formData.append("message", description);
        formData.append("media_file", originFileObj);

        const opt = {
          method: "POST",
          url: `${BASE_URL}/upload`,
          headers: {
            Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
          },
          data: formData,
        };

        axios(opt)
          .then((res) => {
            // The backend creates a new post and returns 201 Created instead of
            // 200 OK. axios only enters .then for 2xx responses, so any success
            // status here should close the modal and refresh the feed.
            if (res.status >= 200 && res.status < 300) {
              message.success("The image/video is uploaded!");
              this.postForm.resetFields();
              this.handleCancel();
              // Only switch tabs / refresh the feed when the upload succeeds.
              if (postType) {
                this.props.onShowPost(postType);
              }
            }
          })
          .catch((err) => {
            console.log("Upload image/video failed: ", err.message);
            message.error("Failed to upload image/video!");
          })
          .finally(() => {
            this.setState({ confirmLoading: false });
          });
      })
      .catch((err) => {
        // Reached when at least one rule failed. Typical cases here:
        //   1. "description" is empty             -> required: true
        //   2. "uploadPost" has no file selected  -> required: true
        //   3. a custom validator calls Promise.reject(new Error("..."))
        // "err.errorFields" lists exactly which fields failed. Ant Design has
        // already painted the red message under each field, so no extra toast
        // is needed here -- we only stop the loading spinner.
        console.log("Form validation error -> ", err);
        this.setState({ confirmLoading: false });
      });
  };

  handleCancel = () => {
    console.log("Clicked cancel button");
    this.setState({
      visible: false,
    });
  };

  render() {
    const { visible, confirmLoading } = this.state;
    return (
      <div>
        <Button type="primary" onClick={this.showModal}>
          Create New Post
        </Button>
        <Modal
          title="Create New Post"
          open={visible}
          onOk={this.handleOk}
          okText="Create"
          confirmLoading={confirmLoading}
          onCancel={this.handleCancel}
        >
          <PostForm
            ref={(refInstance) => {
              this.postForm = refInstance;
            }}
          />
        </Modal>
      </div>
    );
  }
}

export default CreatePostButton;
