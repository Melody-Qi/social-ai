import React, { forwardRef } from "react";
import { Form, Input, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";

export const PostForm = forwardRef(function PostForm(props, formRef) {
  const formItemLayout = {
    labelCol: { xs: { span: 24 }, sm: { span: 6 } },
    wrapperCol: { xs: { span: 24 }, sm: { span: 14 } },
  };

  // Ant Design sometimes sends an upload event object and sometimes an array.
  // Normalize both shapes into the fileList value expected by Form.Item.
  const normFile = (event) =>
    Array.isArray(event) ? event : event?.fileList;

  return (
    <Form name="create_post" {...formItemLayout} ref={formRef}>
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
        <Input />
      </Form.Item>

      <Form.Item label="Dragger">
        <Form.Item
          name="uploadPost"
          valuePropName="fileList"
          getValueFromEvent={normFile}
          noStyle
          rules={[
            {
              required: true,
              message: "Please select an image/video!",
            },
          ]}
        >
          <Upload.Dragger
            name="files"
            beforeUpload={() => false}
            maxCount={1}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">
              Click or drag file to this area to upload
            </p>
          </Upload.Dragger>
        </Form.Item>
      </Form.Item>
    </Form>
  );
});
