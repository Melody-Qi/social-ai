import React, { useState } from "react";
import { Input, Radio } from "antd";

import { SEARCH_KEY } from "../constants";

const { Search } = Input;

function SearchBar(props) {
  const [searchType, setSearchType] = useState(SEARCH_KEY.all);
  const [searchText, setSearchText] = useState("");
  const [error, setError] = useState("");

  const changeSearchType = (e) => {
    const userValue = e.target.value;
    setSearchType(userValue);
    setError("");
    if (userValue === SEARCH_KEY.all) {
      // "All" does not use a keyword. Clear any text retained from an older
      // keyword search so the UI does not suggest that it is being filtered.
      setSearchText("");
      props.handleSearch({ type: userValue, keyword: "" });
    }
  };

  const handleSearch = (value) => {
    if (searchType !== SEARCH_KEY.all && value === "") {
      setError("Please input your search keyword!");
      return;
    }
    setError("");
    props.handleSearch({ type: searchType, keyword: value });
  };

  return (
    <div className="search-bar">
      <Search
        placeholder="input search text"
        enterButton="Search"
        size="large"
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        onSearch={handleSearch}
        disabled={searchType === SEARCH_KEY.all}
      />
      <p className="error-msg">{error}</p>

      <Radio.Group
        onChange={changeSearchType}
        value={searchType}
        className="search-type-group"
      >
        <Radio value={SEARCH_KEY.all}>All</Radio>
        <Radio value={SEARCH_KEY.keyword}>Keyword</Radio>
        <Radio value={SEARCH_KEY.user}>User</Radio>
        <Radio value={SEARCH_KEY.semantic}>Semantic</Radio>
      </Radio.Group>
    </div>
  );
}

export default SearchBar;
