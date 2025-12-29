import { A as _A, type AnchorProps } from "@solidjs/router";
import { useNavigate } from "../hooks/useNavigate";

type CustomAnchorProps = AnchorProps & { back?: boolean };

export const A = (props: CustomAnchorProps) => {
  const navigate = useNavigate();

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    navigate(props.href, { back: props.back });
  };

  return <_A {...props} onClick={handleClick} />;
};
