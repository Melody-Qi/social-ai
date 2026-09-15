import React from "react";
import { App as AntdApp, Form, Input, Button } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import axios from "axios";

import { BASE_URL } from "../constants";

function Login(props) {
  const { handleLoggedIn } = props;
  // Use the Ant Design 5 context-aware message API instead of static methods.
  const { message } = AntdApp.useApp();

  const onFinish = (values) => {
    const { username, password } = values;
    const options = {
      method: "POST",
      url: `${BASE_URL}/signin`,
      data: { username, password },
      headers: { "Content-Type": "application/json" },
    };

    axios(options)
      .then((response) => {
        if (response.status === 200) {
          // The backend returns the JWT as response.data. App.js stores it,
          // updates isLoggedIn, and validates it again after a page refresh.
          handleLoggedIn(response.data);
          message.success("Login succeeded!");
        }
      })
      .catch((error) => {
        console.error("Login failed:", error);
        message.error("Login failed!");
      });
  };

  return (
    <Form name="normal_login" className="login-form" onFinish={onFinish}>
      {/* `rules` receives an array of validation-rule objects. The outer
          JSX braces evaluate JavaScript, the brackets create the array,
          and the inner braces create one rule object. */}
      <Form.Item
        name="username"
        rules={[{ required: true, message: "Please input your Username!" }]}
      >
        <Input
          prefix={<UserOutlined className="site-form-item-icon" />}
          placeholder="Username"
        />
      </Form.Item>

      <Form.Item
        name="password"
        rules={[{ required: true, message: "Please input your Password!" }]}
      >
        <Input
          prefix={<LockOutlined className="site-form-item-icon" />}
          type="password"
          placeholder="Password"
        />
      </Form.Item>

      <Form.Item>
        {/* Button prop explanations (Ant Design 5):
            • type="primary" → Ant Design SEMANTIC button type. AntD offers 5
            •   types with meaning, not just colors:
            •     primary → the MAIN action of a section; at most ONE per area
            •     default → a series of actions with no priority
            •     dashed  → commonly used to ADD more actions
            •     text    → the most secondary action
            •     link    → for navigation / external links
            •   (Internally `type` is syntactic sugar over `color`+`variant`.)
            •   Here "primary" marks Log in as the page's main action. The
            •   inline style forces a black background, overriding the default
            •   blue — so it renders as a black solid button.
            • htmlType="submit" → the NATIVE HTML <button type>. "submit" makes
            •   the button trigger the enclosing <form>'s submit, which Ant
            •   Design's <Form> turns into onFinish. NOTE: htmlType defaults to
            •   "button" (not "submit"), so without this the form would NOT
            •   submit on click.
            • className=... → React/JSX spelling of the HTML class attribute
            •   (since `class` is a reserved word in JS). It connects this
            •   button to `.login-form-button` in Login.css (width: 100%). */}
        <Button
          type="primary"
          htmlType="submit"
          className="login-form-button"
          style={{ backgroundColor: "black" }}
        >
          Log in
        </Button>
        Or <Link to="/register">register now!</Link>
      </Form.Item>
    </Form>
  );
}

export default Login;
