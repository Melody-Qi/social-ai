import React, { useEffect } from "react";
import { Form, Input, Modal, Typography } from "antd";

// Lesson 44 homework: let the user type the post's "message" (caption)
// instead of hardcoding formData.append("message", "AI generated image").
//
// This is the same pattern as CreatePostButton.js -> PostForm.js:
//   Modal (shell)  +  antd Form (input + validation)
// The difference is that the FILE is already in memory (the AI image), so
// there is no Upload.Dragger here -- only the message field.
//
// The component is deliberately "dumb": it owns no upload logic and never
// talks to the backend. It validates the caption and hands the text back to
// the parent through onSubmit(caption). That keeps Landing.js in charge of
// the request, the spinner and the toast, and makes this modal reusable
// anywhere you need "ask the user for a caption before posting".
function PostMessageModal({
  open,
  confirmLoading = false,
  defaultMessage = "AI generated image",
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm();

  // Re-seed the field every time the modal opens, so the second post does
  // not inherit the caption the user typed for the first one.
  useEffect(() => {
    if (open) {
      form.setFieldsValue({ description: defaultMessage });
    }
  }, [open, defaultMessage, form]);

  const handleOk = () => {
    // validateFields() runs the "rules" declared on each Form.Item below.
    //   all rules pass -> resolve(values) -> call the parent with the text
    //   any rule fails -> reject(err)     -> antd already painted the red
    //                                        hint under the input, so we
    //                                        only log and keep it open.
    form
      .validateFields()
      .then((values) => {
        const caption = (values.description || "").trim();
        // If the parent returns a promise, resolve/reject drives whether the
        // caller closes the modal (see Landing.js handleComposerSubmit).
        return onSubmit(caption);
      })
      .catch((err) => {
        console.log("Post message form validation error -> ", err);
      });
  };

  return (
    <Modal
      title="Post to your feed"
      open={open}
      okText={confirmLoading ? "Uploading…" : "Upload"}
      cancelText="Cancel"
      confirmLoading={confirmLoading}
      onOk={handleOk}
      onCancel={onCancel}
      // While the request is in flight, block every way of dismissing the
      // modal -- otherwise the user can cancel mid-upload and end up with a
      // post they cannot see the result of.
      maskClosable={!confirmLoading}
      closable={!confirmLoading}
      keyboard={!confirmLoading}
      cancelButtonProps={{ disabled: confirmLoading }}
      // yet-another-react-lightbox renders its portal at z-index 9999
      // (--yarl__portal_zindex). antd's default modal z-index is 1000, which
      // would put this dialog BEHIND the fullscreen Lightbox. 10000 wins.
      zIndex={10000}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        Give your AI image a caption. It appears under the photo in the feed.
      </Typography.Paragraph>

      <Form form={form} layout="vertical" name="post_message">
        <Form.Item
          name="description"
          label="Message"
          rules={[
            {
              required: true,
              message: "Please input your message!",
            },
          ]}
        >
          {/* 280 is a UI-only choice (Twitter-style); the backend stores
              whatever length you send, so feel free to drop maxLength. */}
          <Input.TextArea
            rows={3}
            showCount
            maxLength={280}
            placeholder="Say something about this photo…"
            autoFocus
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default PostMessageModal;
