import React, { useEffect, useRef, useState } from "react";
import { App as AntdApp, Col, Pagination, Row, Tabs } from "antd";
import axios from "axios";

import SearchBar from "./SearchBar";
import PhotoGallery from "./PhotoGallery";
import CreatePostButton from "./CreatePostButton";
import { BASE_URL, SEARCH_KEY, TOKEN_KEY } from "../constants";

// Match the backend constants (server falls back to these when the client omits
// pagination). Keeping them here lets us avoid "first paint shows 0" before the
// server reply lands.
const DEFAULT_PAGE_SIZE = 12;

function Collection() {
  // Pager + tab + active query. Pages reset to 1 whenever the user switches tab
  // or changes the search filter, otherwise the previous tab's page number
  // could be out of range for the new tab's result set.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState("image");
  const [searchOption, setSearchOption] = useState({
    type: SEARCH_KEY.all,
    keyword: "",
  });
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Page number to fall back to if the request triggered by a pagination click
  // fails (offline, VPN down, 5xx...). null means "this fetch was NOT caused by
  // a page click" (initial mount, tab switch, search) so there is nothing to
  // roll back -- those paths already set page=1 themselves.
  const rollbackPage = useRef(null);

  const { message } = AntdApp.useApp();

  const handleSearch = (option) => {
    setPage(1);
    setSearchOption(option);
  };

  useEffect(() => {
    const { type, keyword } = searchOption;
    // Build the URL with mediaType+page+size on every request. The server
    // returns the post slice for THAT tab only, so we no longer filter in the
    // browser (the previous "fetch all then .filter()" was the cause of the
    // search-all-missing-video bug).
    const params = new URLSearchParams();
    params.set("mediaType", activeTab);
    params.set("page", String(page));
    params.set("size", String(pageSize));

    if (type === SEARCH_KEY.user) {
      params.set("user", keyword);
    } else if (type === SEARCH_KEY.keyword) {
      params.set("keywords", keyword);
    } else if (type === SEARCH_KEY.semantic) {
      // Ask the backend for meaning-based results. mediaType, page and size
      // remain in this same request, preserving filtering and pagination.
      params.set("semantic", keyword);
    }

    // AbortController: cleanly cancel the previous XHR when the effect re-runs
    // (tab change, search, pagination). Without it the older slow response can
    // clobber the newer fresh one. The "active" flag is the second line of
    // defence: even if axios doesn't surface a cancel error, we ignore replies
    // from stale closures.
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    axios
      .get(`${BASE_URL}/search?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
        },
        signal: controller.signal,
      })
      .then((response) => {
        if (!active) return;
        // Either the new paginated shape {posts, total, page, size} (current
        // backend) or the legacy bare array (older deploy). Both are tolerated.
        if (response.data && Array.isArray(response.data.posts)) {
          setPosts(response.data.posts);
          setTotal(response.data.total ?? response.data.posts.length);
        } else if (Array.isArray(response.data)) {
          setPosts(response.data);
          setTotal(response.data.length);
        } else {
          setPosts([]);
          setTotal(0);
        }
        // This page rendered fine, so a later failure has nothing to undo.
        rollbackPage.current = null;
      })
      .catch((error) => {
        if (!active) return;
        // axios throws an "CanceledError" on abort; that is expected when the
        // user switches tabs mid-flight, so swallow it silently.
        if (axios.isCancel(error)) {
          return;
        }
        // Optimistic page update left the pager showing a page whose data we
        // never received (pager says 2, grid still shows page 1). Undo it so
        // the control and the content agree again.
        if (rollbackPage.current !== null) {
          const back = rollbackPage.current;
          rollbackPage.current = null;
          setPage(back);
        }
        const semanticUnavailable =
          type === SEARCH_KEY.semantic && error.response?.status === 503;
        message.error({
          content: semanticUnavailable
            ? "Semantic search is not enabled on the server yet."
            : "Fetch posts failed — check your network / VPN and retry.",
          duration: 6,
          key: "fetch-posts",
        });
        console.error("Fetch posts failed:", error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [activeTab, page, pageSize, searchOption, message]);

  // Called when a new upload finishes. The server already indexed the post with
  // Refresh("wait_for"), so the next /search will see it immediately - no need
  // for the previous 3-second client-side setTimeout that hid newly uploaded
  // videos for several seconds.
  const showPost = (type) => {
    setActiveTab(type);
    setSearchOption({ type: SEARCH_KEY.all, keyword: "" });
    setPage(1);
  };

  const handleTabChange = (key) => {
    setActiveTab(key);
    setPage(1);
  };

  const handlePageChange = (newPage, newPageSize) => {
    // antd fires onChange both when page changes AND when size changes. When
    // only the size changed we want to start from page 1; otherwise antd hands
    // us the new current page directly.
    if (newPageSize !== pageSize) {
      // A size change always lands on page 1, so that is the state to restore.
      rollbackPage.current = 1;
      setPage(1);
      setPageSize(newPageSize);
    } else {
      // Remember where we came from: if this fetch fails we put it back.
      rollbackPage.current = page;
      setPage(newPage);
    }
  };

  const renderPosts = (type) => {
    if (posts.length === 0) {
      return <div>{type === "image" ? "No images!" : "No videos!"}</div>;
    }

    if (type === "image") {
      const images = posts.map((post) => ({
        postId: post.id,
        src: post.url,
        user: post.user,
        caption: post.message,
        thumbnail: post.url,
        thumbnailWidth: 300,
        thumbnailHeight: 200,
      }));

      return <PhotoGallery images={images} />;
    }

    return (
      <Row gutter={[16, 16]}>
        {posts.map((post) => (
          <Col xs={24} sm={12} md={8} key={post.id}>
            <video
              src={post.url}
              controls
              preload="metadata"
              className="video-block"
            />
          </Col>
        ))}
      </Row>
    );
  };

  const tabItems = [
    {
      key: "image",
      label: "Images",
      children: renderPosts("image"),
    },
    {
      key: "video",
      label: "Videos",
      children: renderPosts("video"),
    },
  ];

  return (
    <div className="home">
      <SearchBar handleSearch={handleSearch} />
      <div className="display">
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={tabItems}
          tabBarExtraContent={<CreatePostButton onShowPost={showPost} />}
        />
        <div className="pagination-wrapper">
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            onChange={handlePageChange}
            disabled={loading}
            showSizeChanger
            pageSizeOptions={["6", "12", "24", "48"]}
            showTotal={(t) => `Total ${t} item${t === 1 ? "" : "s"}`}
          />
        </div>
        {loading && <div className="loading-indicator">Loading…</div>}
      </div>
    </div>
  );
}

export default Collection;
