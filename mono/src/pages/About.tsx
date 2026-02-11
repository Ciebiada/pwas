import { Header, HeaderButton } from "ui/Header";
import { BackIcon } from "ui/Icons";
import { Page } from "ui/Page";
import { useNavigate } from "../hooks/useNavigate";

export const About = () => {
  const navigate = useNavigate();

  return (
    <>
      <Header>
        <HeaderButton onClick={() => navigate(-1, { back: true })}>
          <BackIcon />
        </HeaderButton>
      </Header>
      <Page>
        <div class="page-content">
          <h1>About Mono</h1>
          <p>Description under development. Please come back later.</p>
        </div>
      </Page>
    </>
  );
};
