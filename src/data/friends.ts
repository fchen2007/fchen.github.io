export interface FriendLink {
	name: string;
	url: string;
	description?: string;
	avatar?: string;
}

export const friendLinks: FriendLink[] = [
	{
		name: "憨竹子",
		url: "https://moriya.bagfrog.blog/",
		description: "Web大蛇补药杀窝",
		avatar: "https://moriya.bagfrog.blog/_astro/datou.CKNcbI12_ZUcNOb.webp",
	},
	// 按下面的格式添加更多友链：
	// {
	//   name: "朋友的名字",
	//   url: "https://example.com",
	//   description: "一句话介绍",
	//   avatar: "https://example.com/avatar.png",
	// },
];
