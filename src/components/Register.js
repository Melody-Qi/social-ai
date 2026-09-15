import React from "react";
import { useNavigate } from "react-router-dom";
import { App as AntdApp, Form, Input, Button } from "antd";
import axios from "axios";

import { BASE_URL } from "../constants";

// ============================================================================
// CLASSMATE Q&A — answers to common questions about this file
// ============================================================================
// Q1. Is `validator` a built-in like `fetch`?
//     No. `fetch` is a built-in browser/Web API available globally. `validator`
//     is NOT a language or browser feature — it is a KEY that Ant Design's
//     <Form> looks for inside a rule object. You supply a function under
//     `validator`, and Ant Design CALLS that function during validation,
//     passing it (rule, value, callback) (or you return a Promise). So
//     `validator` is an Ant Design CONVENTION, not a built-in like fetch.
//
// Q2. What is a `rule`?
//     A `rule` is ONE object inside the `rules` ARRAY of a <Form.Item>. Each
//     rule describes a single validation constraint, e.g.
//     `{ required: true, message: "..." }` or `{ validator: fn }`. Ant Design
//     runs the rules array top-to-bottom; the first failing rule shows its
//     `message`. Inside `validator(rule, value, ...)`, the first arg `rule` is
//     exactly this rule object, supplied by Ant Design.
//
// Q3. How does `value` get into the validator? I thought we passed
//     `getFieldValue`.
//     Two DIFFERENT things:
//       • `value` = the value of THIS field (here "confirm"). Ant Design passes
//         it automatically as the 2nd argument of your validator function.
//       • `getFieldValue(name)` = a method from the form instance used to READ
//         the value of ANOTHER field (here "password"). That's why the factory
//         function destructures `getFieldValue` out of the form instance so we
//         can compare the confirm value against the password value.
//
// Q4 & Q7. How is this JS connected to Register.css? Is it like
//          className="register-btn"?
//     Exactly that mechanism. JSX `className="register"` on <Form> and
//     `className="register-btn"` on <Button> become HTML class attributes
//     (class="register", class="register-btn"). The browser then applies the
//     matching selectors from Register.css (`.register { ... }`,
//     `.register-btn { ... }`). Register.css is pulled into the bundle via
//     `@import "./Register.css";` inside src/styles/index.css (imported by the
//     app entry), so the classes resolve at runtime.
//
// Q5. Where is the red dot / red icon in the UI reflected in code?
//     It comes from the `hasFeedback` prop on <Form.Item> plus the `message`
//     string in a rule. On FAILURE Ant Design renders a red error icon (✘) and
//     red helper text under the field; on SUCCESS it shows a green check. Ant
//     Design adds CSS classes like `.ant-form-item-has-error` to drive the red
//     styling.
//
// Q6. `useNavigate()` seems unused?
//     It IS used. `const navigate = useNavigate();` captures the navigation
//     function, and onFinish calls `navigate("/login")` after a successful
//     signup (see onFinish above). So the import is not dead code.
// ============================================================================

// Ant Design divides a row into 24 grid columns. On extra-small screens each
// part occupies a full row; on small and wider screens labels use 8 columns
// and input controls use 16 columns.
const formItemLayout = {
  labelCol: {
    xs: { span: 24 },
    sm: { span: 8 },
  },
  wrapperCol: {
    xs: { span: 24 },
    sm: { span: 16 },
  },
};

const tailFormItemLayout = {
  wrapperCol: {
    xs: { span: 16, offset: 0 },
    sm: { span: 16, offset: 8 },
  },
};

function Register() {
  const [form] = Form.useForm();
  // useNavigate() returns the navigation function. It is NOT unused: onFinish
  // calls navigate("/login") after a successful signup (see onFinish above).
  const navigate = useNavigate();
  // Use the Ant Design 5 context-aware message API instead of static methods.
  const { message } = AntdApp.useApp();

  const onFinish = (values) => {
    const { username, password } = values;
    const options = {
      method: "POST",
      url: `${BASE_URL}/signup`,
      data: { username, password },
      headers: { "Content-Type": "application/json" },
    };

    axios(options)
      .then((response) => {
        if (response.status === 200) {
          // Signup creates the account but does not issue a JWT. The user is
          // sent to /login and must authenticate before App marks them logged in.
          message.success("Registration succeeded!");
          navigate("/login");
        }
      })
      .catch((error) => {
        console.error("Registration failed:", error);
        message.error("Registration failed!");
      });
  };

  return (
    // <Form> is Ant Design's form container. Every <Form.Item> child registers
    // itself with it, and the <Form> owns the collect/validate/submit logic.
    //
    // KEY CONSTRUCT 1 -- `{...formItemLayout}`:
    // `{...formItemLayout}` is the JS object SPREAD operator. It copies every
    // top-level key of the `formItemLayout` object (labelCol, wrapperCol) onto
    // this element as individual props, equivalent to writing:
    //   labelCol={formItemLayout.labelCol} wrapperCol={formItemLayout.wrapperCol}
    // Every child <Form.Item> then inherits the same responsive grid
    // (full-width on phones, 8/16 label/control columns on >=sm screens).
    //
    // The other props on <Form>:
    //   form={form}         -> binds the instance from Form.useForm() so we can
    //                          call form.validateFields()/resetFields() later.
    //   name="register"     -> a unique id for this form (also used for caching).
    //   onFinish={onFinish} -> runs ONLY when every field passes validation;
    //                          `values` is { username, password, confirm }.
    //   className="register"-> maps onto Register.css to center/style the form.
    //                          (Register.css reaches the browser because
    //                          index.css does `@import "./Register.css";`; the
    //                          JSX renders class="register", so the selector
    //                          `.register { ... }` applies — same bridge as
    //                          className="register-btn" on the Button below.)
    <Form
      {...formItemLayout}
      form={form}
      name="register"
      onFinish={onFinish}
      className="register"
    >
      {/* `rules` receives an array of validation-rule objects. The outer JSX
          braces evaluate JavaScript, the brackets create the array, and the
          inner braces create one rule object. */}
      <Form.Item
        name="username"
        label="Username"
        rules={[{ required: true, message: "Please input your Username!" }]}
      >
        {/* `name` is the field key; its value is available as values.username
            inside onFinish. `label` is the text shown in the label column
            (left side on >=sm). `rules` is an ARRAY of rule objects; here the
            single rule means: required -> not empty, message -> error text. */}
        <Input />
      </Form.Item>

      <Form.Item
        name="password"
        label="Password"
        rules={[{ required: true, message: "Please input your password!" }]}
        hasFeedback
      >
        {/* <Input.Password /> is a masked field with a show/hide eye toggle.
            `hasFeedback` (on the Form.Item) shows a small status icon next to
            the control: a red ✘ plus red helper text on validation FAILURE,
            a green ✓ on SUCCESS. That red ✘ + red `message` text is the
            "red dot" you see in the UI when a field is invalid. */}
        <Input.Password />
      </Form.Item>

      <Form.Item
        name="confirm"
        label="Confirm Password"
        dependencies={["password"]}
        hasFeedback
        rules={[
          { required: true, message: "Please confirm your password!" },
          // This second rule is a FACTORY FUNCTION, not a plain object. Ant
          // Design allows passing a function that RETURNS a rule object.
          // `({ getFieldValue }) => ({ validator(...) {...} })`
          //   - The outer `(...)` is an arrow function. Its single argument is
          //     the form instance; `{ getFieldValue }` destructures that method
          //     out of it, letting us read the CURRENT value of any other field.
          //   - The `=> ({ ... })` returns an object literal (the rule) that
          //     contains a `validator`. Ant Design calls this factory on each
          //     validation to obtain a fresh, up-to-date rule.
          // `validator(_, value)` receives the confirm field's value and an
          // unused field-name argument `_`. We compare it to
          // getFieldValue("password"); resolve() = valid, reject(error) = invalid.
          ({ getFieldValue }) => ({
            validator(_, value) {
              if (!value || getFieldValue("password") === value) {
                return Promise.resolve();
              }
              return Promise.reject(
                new Error("The two passwords that you entered do not match!")
              );
            },
          }),
        ]}
      >
        {/* KEY CONSTRUCTS 2 & 3
            `dependencies={["password"]}` (on the Form.Item above) declares that
            this "confirm" field depends on the "password" field. Whenever
            password changes, Ant Design re-runs THIS field's validation, so the
            mismatch error updates live instead of only when you re-type confirm.
            The factory-function rule `({ getFieldValue }) => ({ ... })` is
            explained in the `rules` array above. */}
        <Input.Password />
      </Form.Item>

      {/* `{...tailFormItemLayout}` spreads the tail layout: the control column
          starts at offset 8 on >=sm so the button lines up under the inputs
          above (which also use the 8-column label offset). */}
      <Form.Item {...tailFormItemLayout}>
        {/* `type="primary"` gives Ant's default highlighted button style; we
            override the color to black via inline style below.
            `htmlType="submit"` makes this a real <button type="submit">, so
            clicking it triggers the <Form> onFinish. (type="button" would
            never submit the form.) */}
        <Button
          type="primary"
          htmlType="submit"
          className="register-btn"
          style={{ backgroundColor: "black" }}
        >
          Register
        </Button>
      </Form.Item>
    </Form>
  );
}

export default Register;
